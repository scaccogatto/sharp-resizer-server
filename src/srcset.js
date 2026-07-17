import path from 'node:path'

/** Extra output formats sharp can also emit alongside the original (issue: --formats). */
export const CONVERTIBLE_FORMATS = ['webp', 'avif']

/** MIME type for each convertible format — used as `type` in <picture><source>. */
export const FORMAT_MIME_TYPES = { webp: 'image/webp', avif: 'image/avif' }

/**
 * Returns true if the name is a non-empty numeric string — valid as a size folder.
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
 * Builds the {sizes, srcset, src} triple for one group of same-name files
 * spread across size folders.
 * @param {{dir: string, base: string}[]} items
 * @param {string} outDirName
 * @param {string} entryPoint
 * @returns {{sizes: string, srcset: string, src: string}}
 */
function buildVariantEntry(items, outDirName, entryPoint) {
  // Sort largest-first so the leading srcset entry and src point to the best variant
  const sorted = [...items].sort((a, b) => parseInt(b.dir, 10) - parseInt(a.dir, 10))
  const largestDir = sorted[0].dir

  return {
    sizes: `${largestDir}w`,
    srcset: sorted
      .map(({ dir, base }) => `/${entryPoint}/${outDirName}/${dir}/${base} ${dir}w`)
      .join(', '),
    src: `/${entryPoint}/${outDirName}/${largestDir}/${sorted[0].base}`,
  }
}

/**
 * Converts a flat list of output-directory relative paths into the srcset JSON
 * consumed by the API. Follows the format documented in the README:
 *
 *   { "image.jpg": { sizes: "100w", srcset: "...", src: "..." }, ... }
 *
 * When `--formats` generated sibling `<stem>.webp` / `<stem>.avif` files next to
 * an original (e.g. `hero.jpg` + `hero.webp`), the original's entry additionally
 * gains a `formats` map keyed by format name, each with its own srcset/src/type —
 * the original's own `sizes`/`srcset`/`src` fields are untouched (issue: --formats).
 *
 * A stem with only convertible-format extensions and no original extension (e.g.
 * the source image itself was a plain .webp, dropped without --formats) is treated
 * as its own standalone entry, exactly like any other non-numeric-unrelated file —
 * there is no "original" to attach it to.
 *
 * @param {string[]} relativeFiles - Paths relative to outDir, e.g. ['100/a.jpg', '72/a.jpg']
 * @param {string} outDirName      - Directory name used in URLs, e.g. 'output'
 * @param {string} entryPoint      - URL prefix, e.g. 'images'
 * @returns {Record<string, {sizes: string, srcset: string, src: string, formats?: Record<string, {sizes: string, srcset: string, src: string, type: string}>}>}
 */
export function buildSrcset(relativeFiles, outDirName, entryPoint) {
  const parsed = relativeFiles
    .map(f => {
      const { dir, base, name, ext } = path.parse(f)
      return { dir, base, stem: name, ext: ext.slice(1).toLowerCase() }
    })
    .filter(({ dir }) => isValidFolder(dir))

  // Group by filename stem (extension-less), then by extension within the stem
  const byStem = parsed.reduce((acc, item) => {
    ;(acc[item.stem] ??= []).push(item)
    return acc
  }, {})

  const result = {}

  for (const items of Object.values(byStem)) {
    const byExt = items.reduce((acc, item) => {
      ;(acc[item.ext] ??= []).push(item)
      return acc
    }, {})
    // ponytail: assumes any .webp/.avif sharing a stem with a non-format original is a
    // --formats-generated sibling, not a genuinely distinct source image (e.g. a manually
    // dropped photo.jpg + photo.webp pair). Revisit if that assumption ever breaks in practice.
    const originalExts = Object.keys(byExt).filter(ext => !CONVERTIBLE_FORMATS.includes(ext))

    if (originalExts.length === 0) {
      // No original to attach these to — each extension stands on its own (e.g. a
      // plain .webp source dropped without --formats).
      for (const [ext, extItems] of Object.entries(byExt)) {
        const key = ext ? `${extItems[0].stem}.${ext}` : extItems[0].stem
        result[key] = buildVariantEntry(extItems, outDirName, entryPoint)
      }
      continue
    }

    for (const origExt of originalExts) {
      const key = origExt ? `${byExt[origExt][0].stem}.${origExt}` : byExt[origExt][0].stem
      const entry = buildVariantEntry(byExt[origExt], outDirName, entryPoint)

      const formats = CONVERTIBLE_FORMATS.reduce((acc, fmt) => {
        if (byExt[fmt]) {
          acc[fmt] = { ...buildVariantEntry(byExt[fmt], outDirName, entryPoint), type: FORMAT_MIME_TYPES[fmt] }
        }
        return acc
      }, {})
      if (Object.keys(formats).length > 0) entry.formats = formats

      result[key] = entry
    }
  }

  return result
}
