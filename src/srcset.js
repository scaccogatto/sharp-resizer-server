import path from 'node:path'

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
 * Converts a flat list of output-directory relative paths into the srcset JSON
 * consumed by the API. Follows the format documented in the README:
 *
 *   { "image.jpg": { sizes: "100w", srcset: "...", src: "..." }, ... }
 *
 * @param {string[]} relativeFiles - Paths relative to outDir, e.g. ['100/a.jpg', '72/a.jpg']
 * @param {string} outDirName      - Directory name used in URLs, e.g. 'output'
 * @param {string} entryPoint      - URL prefix, e.g. 'images'
 * @returns {Record<string, {sizes: string, srcset: string, src: string}>}
 */
export function buildSrcset(relativeFiles, outDirName, entryPoint) {
  const parsed = relativeFiles
    .map(f => {
      const { dir, base } = path.parse(f)
      return { dir, group: base }
    })
    .filter(({ dir }) => isValidFolder(dir))

  // Group by filename
  const groups = parsed.reduce((acc, item) => {
    ;(acc[item.group] ??= []).push(item)
    return acc
  }, {})

  return Object.entries(groups).reduce((obj, [key, items]) => {
    // Sort largest-first so the leading srcset entry and src point to the best variant
    const sorted = [...items].sort((a, b) => parseInt(b.dir) - parseInt(a.dir))
    const largestDir = sorted[0].dir

    obj[key] = {
      sizes: `${largestDir}w`,
      srcset: sorted
        .map(({ dir, group }) => `/${entryPoint}/${outDirName}/${dir}/${group} ${dir}w`)
        .join(', '),
      src: `/${entryPoint}/${outDirName}/${largestDir}/${key}`,
    }
    return obj
  }, {})
}
