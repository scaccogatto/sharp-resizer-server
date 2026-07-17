import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../src/app.js'
import supertest from 'supertest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

let tmpDir
let app
let cache

/**
 * Writes a minimal JPEG to disk at the given path.
 */
async function seedImage(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .jpeg()
    .toFile(filePath)
}

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
    expect(entry.sizes).toBe('100w')
    expect(entry.src).toBe('/images/output/100/bigImage.jpg')
    // All three variants (100, 72, 37) in the srcset
    const variants = entry.srcset.split(', ')
    expect(variants).toHaveLength(3)
    expect(variants[0]).toBe('/images/output/100/bigImage.jpg 100w')
  })

  it('has the correct shape for mediumImage.png', async () => {
    const res = await supertest(app).get('/images/json')
    const entry = res.body['mediumImage.png']
    expect(entry).toBeDefined()
    expect(entry.sizes).toBe('37w')
    expect(entry.src).toBe('/images/output/37/mediumImage.png')
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

    const second = await supertest(app).get('/images/json').set('If-None-Match', etag)
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
    // seedImage always writes a JPEG regardless of extension — fine, buildSrcset only cares about the extension.
    await seedImage(path.join(tmpDir, 'output', '100', 'withFormats.webp'))
    await seedImage(path.join(tmpDir, 'output', '100', 'withFormats.avif'))
    cache.invalidate()

    const res = await supertest(app).get('/images/json')
    const entry = res.body['withFormats.jpg']
    expect(entry).toBeDefined()
    expect(entry.formats.webp).toMatchObject({ type: 'image/webp', src: '/images/output/100/withFormats.webp' })
    expect(entry.formats.avif).toMatchObject({ type: 'image/avif', src: '/images/output/100/withFormats.avif' })

    // Original entry's own fields are untouched by the presence of formats
    expect(entry.sizes).toBe('100w')
    expect(entry.src).toBe('/images/output/100/withFormats.jpg')
  })
})
