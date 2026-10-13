import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../src/app.js'
import supertest from 'supertest'
import { mkdtemp, mkdir, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

/** @type {string} */
let tmpDir
/** @type {ReturnType<typeof createApp>['app']} */
let app
/** @type {ReturnType<typeof createApp>['cache']} */
let cache

/**
 * Writes a minimal JPEG to disk at the given path.
 * @param {string} filePath
 */
async function seedImage(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .jpeg()
    .toFile(filePath)
}

/**
 * Strips the `?v=` cache-busting token from a manifest URL.
 * @param {string} url
 */
const unversioned = url => url.replace(/\?v=[^ ,]*/g, '')

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'sharp-server-test-'))

  // Seed output directory with resized images simulating a running server
  await seedImage(path.join(tmpDir, 'output', '100', 'bigImage.jpg'))
  await seedImage(path.join(tmpDir, 'output', '72', 'bigImage.jpg'))
  await seedImage(path.join(tmpDir, 'output', '37', 'bigImage.jpg'))
  await seedImage(path.join(tmpDir, 'output', '37', 'mediumImage.png'))
  await seedImage(path.join(tmpDir, 'output', '26', 'mediumImage.png'))

  ;({ app, cache } = createApp({
    outDir: path.join(tmpDir, 'output'),
    outDirName: 'output',
    entryPoint: 'images',
    multiplier: 19.2,
  }))
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('GET /images/json', () => {
  it('returns 200 with a JSON object', async () => {
    const res = await supertest(app).get('/images/json')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(typeof res.body).toBe('object')
  })

  it('has the correct shape for bigImage.jpg', async () => {
    const res = await supertest(app).get('/images/json')
    const entry = res.body['bigImage.jpg']
    expect(entry).toBeDefined()
    expect(entry.width).toBe(1920)
    expect(unversioned(entry.src)).toBe('/images/output/100/bigImage.jpg')
    // All three variants (100, 72, 37) in the srcset, with real pixel widths
    expect(unversioned(entry.srcset)).toBe(
      '/images/output/100/bigImage.jpg 1920w, /images/output/72/bigImage.jpg 1382w, /images/output/37/bigImage.jpg 710w',
    )
  })

  it('has the correct shape for mediumImage.png', async () => {
    const res = await supertest(app).get('/images/json')
    const entry = res.body['mediumImage.png']
    expect(entry).toBeDefined()
    expect(entry.width).toBe(710)
    expect(unversioned(entry.src)).toBe('/images/output/37/mediumImage.png')
    expect(entry.srcset.split(', ')).toHaveLength(2)
  })

  it('sets an ETag header', async () => {
    const res = await supertest(app).get('/images/json')
    expect(res.headers.etag).toBeDefined()
  })

  it('returns 304 when If-None-Match matches the ETag (issue #8)', async () => {
    const first = await supertest(app).get('/images/json')
    const etag = first.headers.etag
    expect(etag).toBeDefined()

    const second = await supertest(app).get('/images/json').set('If-None-Match', etag ?? '')
    expect(second.status).toBe(304)
  })

  it('returns fresh data after cache is invalidated', async () => {
    // Seed a new file, invalidate the cache, and confirm the next response includes it
    await seedImage(path.join(tmpDir, 'output', '100', 'newImage.jpg'))
    cache.invalidate()

    const res = await supertest(app).get('/images/json')
    expect(res.body['newImage.jpg']).toBeDefined()
  })

  it('includes type-tagged webp/avif format entries when --formats siblings are present', async () => {
    await seedImage(path.join(tmpDir, 'output', '100', 'withFormats.jpg'))
    // seedImage always writes a JPEG regardless of extension: fine, buildSrcset only cares about the extension.
    await seedImage(path.join(tmpDir, 'output', '100', 'withFormats.webp'))
    await seedImage(path.join(tmpDir, 'output', '100', 'withFormats.avif'))
    cache.invalidate()

    const res = await supertest(app).get('/images/json')
    const entry = res.body['withFormats.jpg']
    expect(entry).toBeDefined()
    expect(entry.formats.webp.type).toBe('image/webp')
    expect(unversioned(entry.formats.webp.src)).toBe('/images/output/100/withFormats.webp')
    expect(entry.formats.avif.type).toBe('image/avif')
    expect(unversioned(entry.formats.avif.src)).toBe('/images/output/100/withFormats.avif')

    expect(entry.width).toBe(1920)
    expect(unversioned(entry.src)).toBe('/images/output/100/withFormats.jpg')
  })
})

describe('output file caching', () => {
  it('versions manifest URLs with the file mtime, so a re-render changes the URL', async () => {
    const file = path.join(tmpDir, 'output', '100', 'rerendered.jpg')
    await seedImage(file)
    await utimes(file, new Date(1_000_000), new Date(1_000_000))
    cache.invalidate()
    const before = (await supertest(app).get('/images/json')).body['rerendered.jpg'].src

    // Same path, new bytes: what a re-render after a source edit produces
    await seedImage(file)
    await utimes(file, new Date(2_000_000), new Date(2_000_000))
    cache.invalidate()
    const after = (await supertest(app).get('/images/json')).body['rerendered.jpg'].src

    expect(before).toMatch(/\?v=/)
    expect(after).toMatch(/\?v=/)
    expect(after).not.toBe(before)
  })

  it('serves versioned manifest URLs as immutable', async () => {
    cache.invalidate()
    const { src } = (await supertest(app).get('/images/json')).body['bigImage.jpg']
    const res = await supertest(app).get(src)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
  })

  it('makes clients revalidate unversioned URLs, which can be rewritten in place', async () => {
    const res = await supertest(app).get('/images/output/100/bigImage.jpg')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.headers.etag).toBeDefined()
  })
})
