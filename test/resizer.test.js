import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resizeImage } from '../src/resizer.js'
import sharp from 'sharp'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let tmpDir

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'sharp-resizer-test-'))
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

/**
 * Creates a minimal JPEG in-memory using sharp and writes it to disk.
 * This avoids shipping any fixture binaries to the repo.
 */
async function createTestImage(filePath, width = 200, height = 100) {
  await sharp({
    create: { width, height, channels: 3, background: { r: 128, g: 64, b: 32 } },
  })
    .jpeg()
    .toFile(filePath)
}

describe('resizeImage', () => {
  it('resizes a JPEG to the requested pixel width', async () => {
    const src = path.join(tmpDir, 'source.jpg')
    const dst = path.join(tmpDir, 'resized', 'out.jpg')
    await createTestImage(src, 400, 200)

    const ok = await resizeImage(src, dst, 100)
    expect(ok).toBe(true)

    // Verify the output dimensions
    const meta = await sharp(dst).metadata()
    expect(meta.width).toBe(100)
    // Height should be proportional (200/400 * 100 = 50)
    expect(meta.height).toBe(50)
  })

  it('creates missing output directories automatically', async () => {
    const src = path.join(tmpDir, 'auto-dir-src.jpg')
    const dst = path.join(tmpDir, 'deep', 'nested', 'dir', 'out.jpg')
    await createTestImage(src, 100, 100)

    const ok = await resizeImage(src, dst, 50)
    expect(ok).toBe(true)
  })

  it('returns false and does not throw when the source file does not exist (issue #4)', async () => {
    const ok = await resizeImage('/nonexistent/image.jpg', path.join(tmpDir, 'should-not-exist.jpg'), 100)
    expect(ok).toBe(false)
  })

  it('rounds widthPx to an integer before passing to sharp', async () => {
    const src = path.join(tmpDir, 'float-width-src.jpg')
    const dst = path.join(tmpDir, 'float-width-out.jpg')
    await createTestImage(src, 300, 200)

    // 72 * 19.2 = 1382.4 — the multiplier produces floats
    const ok = await resizeImage(src, dst, 72 * 19.2)
    expect(ok).toBe(true)
  })

  it('does not emit format siblings when formats is omitted (no-flag behavior unchanged)', async () => {
    const src = path.join(tmpDir, 'no-formats-src.jpg')
    const dst = path.join(tmpDir, 'no-formats-out.jpg')
    await createTestImage(src)

    const ok = await resizeImage(src, dst, 100)
    expect(ok).toBe(true)

    await expect(access(path.join(tmpDir, 'no-formats-out.webp'))).rejects.toThrow()
    await expect(access(path.join(tmpDir, 'no-formats-out.avif'))).rejects.toThrow()
  })

  it('emits <basename>.webp and <basename>.avif siblings when formats is given', async () => {
    const src = path.join(tmpDir, 'formats-src.jpg')
    const dst = path.join(tmpDir, 'formats', 'formats-out.jpg')
    await createTestImage(src, 400, 200)

    const ok = await resizeImage(src, dst, 100, ['webp', 'avif'])
    expect(ok).toBe(true)

    const webpPath = path.join(tmpDir, 'formats', 'formats-out.webp')
    const avifPath = path.join(tmpDir, 'formats', 'formats-out.avif')

    const [jpegMeta, webpMeta, avifMeta] = await Promise.all([
      sharp(dst).metadata(),
      sharp(webpPath).metadata(),
      sharp(avifPath).metadata(),
    ])

    expect(jpegMeta.format).toBe('jpeg')
    expect(webpMeta.mediaType).toBe('image/webp')
    expect(avifMeta.mediaType).toBe('image/avif') // libvips reports the raw `format` as 'heif' for AVIF containers

    // Same target width as the original, across every emitted format
    expect(webpMeta.width).toBe(100)
    expect(avifMeta.width).toBe(100)
  })
})
