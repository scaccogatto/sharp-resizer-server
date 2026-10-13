import { describe, it, expect } from 'vitest'
import { isValidFolder, getTargetFolders, buildSrcset, folderWidth } from '../src/srcset.js'

/** Default CLI multiplier: -m 1920 → folder 100 is 1920 px wide. */
const opts = { outDirName: 'output', entryPoint: 'images', multiplier: 19.2 }

/**
 * Returns the manifest entry for key, failing the test when it is missing.
 * @param {ReturnType<typeof buildSrcset>} manifest
 * @param {string} key
 */
function entryOf(manifest, key) {
  const entry = manifest[key]
  if (!entry) throw new Error(`missing manifest entry ${key}`)
  return entry
}

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

describe('folderWidth', () => {
  it('is folder × multiplier, rounded to whole pixels', () => {
    expect(folderWidth('100', 19.2)).toBe(1920)
    expect(folderWidth('72', 19.2)).toBe(1382)
    expect(folderWidth('16', 19.2)).toBe(307)
    expect(folderWidth('100', 12.8)).toBe(1280)
  })
})

describe('buildSrcset', () => {
  // Oracle derived from the README example
  const bigFiles = ['100/bigImage.jpg', '72/bigImage.jpg', '37/bigImage.jpg', '26/bigImage.jpg', '16/bigImage.jpg']
  const mediumFiles = ['37/mediumImage.png', '26/mediumImage.png', '16/mediumImage.png']

  it('uses real pixel widths as srcset w descriptors, largest first', () => {
    const entry = entryOf(buildSrcset(bigFiles, opts), 'bigImage.jpg')

    expect(entry).toMatchObject({ width: 1920, src: '/images/output/100/bigImage.jpg' })
    expect(entry.srcset).toBe(
      '/images/output/100/bigImage.jpg 1920w, /images/output/72/bigImage.jpg 1382w, ' +
        '/images/output/37/bigImage.jpg 710w, /images/output/26/bigImage.jpg 499w, ' +
        '/images/output/16/bigImage.jpg 307w',
    )
  })

  it('does not emit an invalid "Nw" sizes value', () => {
    const entry = entryOf(buildSrcset(bigFiles, opts), 'bigImage.jpg')
    expect(entry).not.toHaveProperty('sizes')
  })

  it('derives widths from the multiplier', () => {
    const entry = entryOf(buildSrcset(['100/x.jpg', '50/x.jpg'], { ...opts, multiplier: 12.8 }), 'x.jpg')
    expect(entry.width).toBe(1280)
    expect(entry.srcset).toBe('/images/output/100/x.jpg 1280w, /images/output/50/x.jpg 640w')
  })

  it('produces correct width, srcset, and src for a mid-resolution image', () => {
    const entry = entryOf(buildSrcset(mediumFiles, opts), 'mediumImage.png')
    expect(entry).toMatchObject({ width: 710, src: '/images/output/37/mediumImage.png' })
    expect(entry.srcset.split(', ')).toHaveLength(3)
  })

  it('handles multiple images together', () => {
    const result = buildSrcset([...bigFiles, ...mediumFiles], opts)
    expect(Object.keys(result)).toHaveLength(2)
    expect(entryOf(result, 'bigImage.jpg').width).toBe(1920)
    expect(entryOf(result, 'mediumImage.png').width).toBe(710)
  })

  it('returns an empty object when there are no files', () => {
    expect(buildSrcset([], opts)).toEqual({})
  })

  it('ignores non-numeric top-level directories', () => {
    const entry = entryOf(buildSrcset(['100/a.jpg', 'thumbs/a.jpg', '.cache/a.jpg'], opts), 'a.jpg')
    expect(entry.width).toBe(1920)
    expect(entry.srcset.split(', ')).toHaveLength(1)
  })

  it('respects the entryPoint URL prefix', () => {
    const entry = entryOf(buildSrcset(['100/x.jpg'], { ...opts, entryPoint: 'static' }), 'x.jpg')
    expect(entry.src).toContain('/static/output/')
    expect(entry.srcset).toContain('/static/output/100/')
  })

  it('appends the version token as ?v= when one is known for the file', () => {
    const versions = new Map([['100/x.jpg', 'abc']])
    const entry = entryOf(buildSrcset(['100/x.jpg', '72/x.jpg'], { ...opts, versions }), 'x.jpg')
    expect(entry.src).toBe('/images/output/100/x.jpg?v=abc')
    expect(entry.srcset).toBe('/images/output/100/x.jpg?v=abc 1920w, /images/output/72/x.jpg 1382w')
  })

  it('percent-encodes file names so spaces and commas do not break srcset parsing', () => {
    const entry = entryOf(buildSrcset(['100/my photo, 1.jpg'], opts), 'my photo, 1.jpg')
    expect(entry.srcset).toBe('/images/output/100/my%20photo%2C%201.jpg 1920w')
  })

  it('no-flag behavior unchanged: original entry has no formats key without sibling webp/avif files', () => {
    const entry = entryOf(buildSrcset(bigFiles, opts), 'bigImage.jpg')
    expect(entry.formats).toBeUndefined()
    expect(Object.keys(entry)).toEqual(['width', 'srcset', 'src'])
  })

  it("attaches webp/avif siblings under the original entry's formats map with correct type MIME", () => {
    const files = [
      '100/hero.jpg', '72/hero.jpg', '37/hero.jpg',
      '100/hero.webp', '72/hero.webp', '37/hero.webp',
      '100/hero.avif', '72/hero.avif', '37/hero.avif',
    ]
    const result = buildSrcset(files, opts)
    const entry = entryOf(result, 'hero.jpg')

    expect(entry).toMatchObject({
      width: 1920,
      srcset: '/images/output/100/hero.jpg 1920w, /images/output/72/hero.jpg 1382w, /images/output/37/hero.jpg 710w',
      src: '/images/output/100/hero.jpg',
    })
    expect(entry.formats?.webp).toMatchObject({
      width: 1920,
      srcset: '/images/output/100/hero.webp 1920w, /images/output/72/hero.webp 1382w, /images/output/37/hero.webp 710w',
      src: '/images/output/100/hero.webp',
      type: 'image/webp',
    })
    expect(entry.formats?.avif).toMatchObject({
      width: 1920,
      srcset: '/images/output/100/hero.avif 1920w, /images/output/72/hero.avif 1382w, /images/output/37/hero.avif 710w',
      src: '/images/output/100/hero.avif',
      type: 'image/avif',
    })

    // No standalone 'hero.webp' / 'hero.avif' top-level keys: they live under formats
    expect(result['hero.webp']).toBeUndefined()
    expect(result['hero.avif']).toBeUndefined()
  })

  it('attaches only the formats that are actually present (partial --formats)', () => {
    const files = ['100/hero.jpg', '72/hero.jpg', '100/hero.webp', '72/hero.webp']
    const entry = entryOf(buildSrcset(files, opts), 'hero.jpg')

    expect(entry.formats).toHaveProperty('webp')
    expect(entry.formats).not.toHaveProperty('avif')
  })

  it('treats a stem with only a convertible-format extension as its own standalone entry', () => {
    // A genuine .webp source dropped without --formats: no original to attach to.
    const entry = entryOf(buildSrcset(['100/plain.webp', '72/plain.webp'], opts), 'plain.webp')

    expect(entry).toMatchObject({ width: 1920, src: '/images/output/100/plain.webp' })
    expect(entry.formats).toBeUndefined()
  })
})
