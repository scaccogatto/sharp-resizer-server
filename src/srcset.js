import path from 'node:path'

/** @typedef {'webp' | 'avif'} ConvertibleFormat */

/**
 * Extra output formats sharp can also emit alongside the original (issue: --formats).
 * @type {readonly ConvertibleFormat[]}
 */
export const CONVERTIBLE_FORMATS = ['webp', 'avif']

/**
 * @param {string} ext
 * @returns {ext is ConvertibleFormat}
 */
export const isConvertibleFormat = ext => /** @type {readonly string[]} */ (CONVERTIBLE_FORMATS).includes(ext)

/**
 * MIME type for each convertible format, used as `type` in <picture><source>.
 * @type {Readonly<Record<ConvertibleFormat, string>>}
 */
export const FORMAT_MIME_TYPES = { webp: 'image/webp', avif: 'image/avif' }

/**
 * Returns true if the name is a non-empty numeric string, valid as a size folder.
 * @param {string} name
 * @returns {boolean}
 */
export const isValidFolder = name => {
  const trimmed = String(name).trim()
  return trimmed !== '' && !Number.isNaN(Number(trimmed))
}

/**
 * Returns the target output folders for a given source folder.
 * Without allowUpscale, only folders numerically ≤ sourceFolder are included
 * (i.e., no upscaling). With allowUpscale, all folders are valid targets.
 *
 * @param {string} sourceFolder - e.g., '100'
 * @param {string[]} allFolders - e.g., ['16', '26', '37', '72', '100']
 * @param {boolean} allowUpscale - close issue #2
 * @returns {string[]}
 */
export const getTargetFolders = (sourceFolder, allFolders, allowUpscale = false) => {
  const sourceNum = parseInt(sourceFolder, 10)
  return allFolders.filter(f => allowUpscale || parseInt(f, 10) <= sourceNum)
}

/**
 * Pixel width that a numeric size folder is resized to: `folder × multiplier`,
 * where multiplier is the pixel width of folder 100 divided by 100.
 * Shared by the resize pipeline and the manifest so `w` descriptors always
 * match the real file widths.
 * @param {string} folder - e.g. '72'
 * @param {number} multiplier - e.g. 19.2
 * @returns {number} e.g. 1382
 */
export const folderWidth = (folder, multiplier) => Math.round(parseInt(folder, 10) * multiplier)

/**
 * @typedef {object} ManifestOptions
 * @property {string} outDirName - URL segment of the output directory, e.g. 'output'
 * @property {string} entryPoint - URL prefix, e.g. 'images'
 * @property {number} multiplier - pixel width of folder 100 divided by 100, e.g. 19.2
 * @property {ReadonlyMap<string, string>} [versions] - relative path → cache-busting token appended as `?v=`
 */

/**
 * @typedef {object} VariantEntry
 * @property {number} width - pixel width of the largest variant
 * @property {string} srcset - every variant, largest first, with pixel `w` descriptors
 * @property {string} src - URL of the largest variant
 */

/** @typedef {{dir: string, base: string, stem: string, ext: string, rel: string}} ParsedFile */

/**
 * Builds the {width, srcset, src} triple for one group of same-name files
 * spread across size folders.
 * @param {ParsedFile[]} items
 * @param {ManifestOptions} opts
 * @returns {VariantEntry}
 */
function buildVariantEntry(items, { outDirName, entryPoint, multiplier, versions }) {
  // Sort largest-first so the leading srcset entry and src point to the best variant
  const sorted = [...items].sort((a, b) => parseInt(b.dir, 10) - parseInt(a.dir, 10))
  const [largest] = sorted
  if (!largest) throw new Error('buildVariantEntry needs at least one file')
  /** @param {ParsedFile} item */
  const url = ({ dir, base, rel }) => {
    const version = versions?.get(rel)
    const query = version ? `?v=${encodeURIComponent(version)}` : ''
    return `/${entryPoint}/${outDirName}/${encodeURIComponent(dir)}/${encodeURIComponent(base)}${query}`
  }

  return {
    width: folderWidth(largest.dir, multiplier),
    srcset: sorted.map(item => `${url(item)} ${folderWidth(item.dir, multiplier)}w`).join(', '),
    src: url(largest),
  }
}

/**
 * @typedef {VariantEntry & {type: string}} FormatEntry
 * @typedef {VariantEntry & {formats?: Record<string, FormatEntry>}} ManifestEntry
 */

/**
 * Converts a flat list of output-directory relative paths into the srcset JSON
 * consumed by the API. Follows the format documented in the README:
 *
 *   { "image.jpg": { width: 1920, srcset: "... 1920w, ... 1382w", src: "..." }, ... }
 *
 * Each `w` descriptor is the real pixel width of that variant (folder × multiplier),
 * so browsers can pick the right candidate from a `sizes` attribute the page provides.
 *
 * When `--formats` generated sibling `<stem>.webp` / `<stem>.avif` files next to
 * an original (e.g. `hero.jpg` + `hero.webp`), the original's entry additionally
 * gains a `formats` map keyed by format name, each with its own width/srcset/src/type.
 *
 * A stem with only convertible-format extensions and no original extension (e.g.
 * the source image itself was a plain .webp, dropped without --formats) is treated
 * as its own standalone entry: there is no "original" to attach it to.
 *
 * @param {string[]} relativeFiles - Paths relative to outDir, e.g. ['100/a.jpg', '72/a.jpg']
 * @param {ManifestOptions} opts
 * @returns {Record<string, ManifestEntry>}
 */
export function buildSrcset(relativeFiles, opts) {
  /** @type {ParsedFile[]} */
  const parsed = relativeFiles
    .map(rel => {
      const { dir, base, name, ext } = path.parse(rel)
      return { dir, base, stem: name, ext: ext.slice(1).toLowerCase(), rel }
    })
    .filter(({ dir }) => isValidFolder(dir))

  // Group by filename stem (extension-less), then by extension within the stem
  const byStem = Map.groupBy(parsed, item => item.stem)

  /** @type {Record<string, ManifestEntry>} */
  const result = {}

  for (const [stem, items] of byStem) {
    const byExt = Map.groupBy(items, item => item.ext)
    // ponytail: assumes any .webp/.avif sharing a stem with a non-format original is a
    // --formats-generated sibling, not a genuinely distinct source image (e.g. a manually
    // dropped photo.jpg + photo.webp pair). Revisit if that assumption ever breaks in practice.
    const originalExts = [...byExt.keys()].filter(ext => !isConvertibleFormat(ext))

    if (originalExts.length === 0) {
      // No original to attach these to: each extension stands on its own (e.g. a
      // plain .webp source dropped without --formats).
      for (const [ext, extItems] of byExt) {
        const key = ext ? `${stem}.${ext}` : stem
        result[key] = buildVariantEntry(extItems, opts)
      }
      continue
    }

    for (const origExt of originalExts) {
      const origItems = byExt.get(origExt) ?? []
      const key = origExt ? `${stem}.${origExt}` : stem
      /** @type {ManifestEntry} */
      const entry = buildVariantEntry(origItems, opts)

      /** @type {Record<string, FormatEntry>} */
      const formats = {}
      for (const fmt of CONVERTIBLE_FORMATS) {
        const fmtItems = byExt.get(fmt)
        if (fmtItems) formats[fmt] = { ...buildVariantEntry(fmtItems, opts), type: FORMAT_MIME_TYPES[fmt] }
      }
      if (Object.keys(formats).length > 0) entry.formats = formats

      result[key] = entry
    }
  }

  return result
}
