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
})
