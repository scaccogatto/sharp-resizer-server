import { describe, it, expect } from 'vitest'
import { isValidFolder, getTargetFolders, buildSrcset } from '../src/srcset.js'

describe('isValidFolder', () => {
  it('accepts numeric strings', () => {
    expect(isValidFolder('100')).toBe(true)
    expect(isValidFolder('72')).toBe(true)
    expect(isValidFolder('0')).toBe(true)
  })

  it('rejects empty strings and non-numeric names', () => {
    expect(isValidFolder('')).toBe(false)
    expect(isValidFolder(' ')).toBe(false)
    expect(isValidFolder('abc')).toBe(false)
    expect(isValidFolder('node_modules')).toBe(false)
  })

  it('accepts floating point folder names (the README says folder names must be Numbers)', () => {
    expect(isValidFolder('3.14')).toBe(true)
  })
})

describe('getTargetFolders', () => {
  const folders = ['16', '26', '37', '72', '100']

  it('returns folders ≤ source folder by default (no upscale)', () => {
    expect(getTargetFolders('37', folders)).toEqual(['16', '26', '37'])
  })

  it('returns all folders when allowUpscale is true (issue #2)', () => {
    expect(getTargetFolders('37', folders, true)).toEqual(folders)
  })

  it('returns all folders when source is the largest', () => {
    expect(getTargetFolders('100', folders)).toEqual(folders)
  })

  it('returns only the exact folder when source is the smallest', () => {
    expect(getTargetFolders('16', folders)).toEqual(['16'])
  })
})

describe('buildSrcset', () => {
  // Oracle derived from the README example
  const bigFiles = ['100/bigImage.jpg', '72/bigImage.jpg', '37/bigImage.jpg', '26/bigImage.jpg', '16/bigImage.jpg']
  const mediumFiles = ['37/mediumImage.png', '26/mediumImage.png', '16/mediumImage.png']

  it('produces correct sizes, srcset, and src for a full-resolution image', () => {
    const result = buildSrcset(bigFiles, 'output', 'images')

    expect(result['bigImage.jpg']).toMatchObject({
      sizes: '100w',
      src: '/images/output/100/bigImage.jpg',
    })

    // All 5 variants must appear in srcset, largest first
    const variants = result['bigImage.jpg'].srcset.split(', ')
    expect(variants).toHaveLength(5)
    expect(variants[0]).toBe('/images/output/100/bigImage.jpg 100w')
    expect(variants[4]).toBe('/images/output/16/bigImage.jpg 16w')
  })

  it('produces correct sizes, srcset, and src for a mid-resolution image', () => {
    const result = buildSrcset(mediumFiles, 'output', 'images')

    expect(result['mediumImage.png']).toMatchObject({
      sizes: '37w',
      src: '/images/output/37/mediumImage.png',
    })
    expect(result['mediumImage.png'].srcset.split(', ')).toHaveLength(3)
  })

  it('handles multiple images together', () => {
    const result = buildSrcset([...bigFiles, ...mediumFiles], 'output', 'images')
    expect(Object.keys(result)).toHaveLength(2)
    expect(result['bigImage.jpg'].sizes).toBe('100w')
    expect(result['mediumImage.png'].sizes).toBe('37w')
  })

  it('returns an empty object when there are no files', () => {
    expect(buildSrcset([], 'output', 'images')).toEqual({})
  })

  it('ignores non-numeric top-level directories', () => {
    const mixed = ['100/a.jpg', 'thumbs/a.jpg', '.cache/a.jpg']
    const result = buildSrcset(mixed, 'output', 'images')
    // Only the 100/ file should appear
    const entry = result['a.jpg']
    expect(entry.sizes).toBe('100w')
    expect(entry.srcset.split(', ')).toHaveLength(1)
  })

  it('respects the entryPoint URL prefix', () => {
    const result = buildSrcset(['100/x.jpg'], 'output', 'static')
    expect(result['x.jpg'].src).toContain('/static/output/')
    expect(result['x.jpg'].srcset).toContain('/static/output/100/')
  })

  it('multiplier invariant: -m 1920 means folder-100 maps to 1920px label in sizes', () => {
    // The sizes field is the folder name + 'w', not the pixel width.
    // Pixel width is computed externally as folder * (m/100).
    const result = buildSrcset(['100/img.jpg'], 'output', 'images')
    expect(result['img.jpg'].sizes).toBe('100w')
  })

  it('no-flag behavior unchanged: original entry has no formats key without sibling webp/avif files', () => {
    const result = buildSrcset(bigFiles, 'output', 'images')
    expect(result['bigImage.jpg'].formats).toBeUndefined()
    expect(Object.keys(result['bigImage.jpg'])).toEqual(['sizes', 'srcset', 'src'])
  })

  it('attaches webp/avif siblings under the original entry\'s formats map with correct type MIME', () => {
    const files = [
      '100/hero.jpg', '72/hero.jpg', '37/hero.jpg',
      '100/hero.webp', '72/hero.webp', '37/hero.webp',
      '100/hero.avif', '72/hero.avif', '37/hero.avif',
    ]
    const result = buildSrcset(files, 'output', 'images')

    // Original entry stays byte-identical for backward compatibility
    expect(result['hero.jpg']).toMatchObject({
      sizes: '100w',
      srcset: '/images/output/100/hero.jpg 100w, /images/output/72/hero.jpg 72w, /images/output/37/hero.jpg 37w',
      src: '/images/output/100/hero.jpg',
    })

    expect(result['hero.jpg'].formats.webp).toMatchObject({
      sizes: '100w',
      srcset: '/images/output/100/hero.webp 100w, /images/output/72/hero.webp 72w, /images/output/37/hero.webp 37w',
      src: '/images/output/100/hero.webp',
      type: 'image/webp',
    })
    expect(result['hero.jpg'].formats.avif).toMatchObject({
      sizes: '100w',
      srcset: '/images/output/100/hero.avif 100w, /images/output/72/hero.avif 72w, /images/output/37/hero.avif 37w',
      src: '/images/output/100/hero.avif',
      type: 'image/avif',
    })

    // No standalone 'hero.webp' / 'hero.avif' top-level keys — they live under formats
    expect(result['hero.webp']).toBeUndefined()
    expect(result['hero.avif']).toBeUndefined()
  })

  it('attaches only the formats that are actually present (partial --formats)', () => {
    const files = ['100/hero.jpg', '72/hero.jpg', '100/hero.webp', '72/hero.webp']
    const result = buildSrcset(files, 'output', 'images')

    expect(result['hero.jpg'].formats).toHaveProperty('webp')
    expect(result['hero.jpg'].formats).not.toHaveProperty('avif')
  })

  it('treats a stem with only a convertible-format extension as its own standalone entry', () => {
    // A genuine .webp source dropped without --formats — no original to attach to.
    const result = buildSrcset(['100/plain.webp', '72/plain.webp'], 'output', 'images')

    expect(result['plain.webp']).toMatchObject({
      sizes: '100w',
      src: '/images/output/100/plain.webp',
    })
    expect(result['plain.webp'].formats).toBeUndefined()
  })
})
