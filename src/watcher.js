import chokidar from 'chokidar'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { isValidFolder, getTargetFolders } from './srcset.js'

/**
 * Sets up a chokidar watcher on inputDir.
 *
 * Fires onResize when an image should be resized and onInvalidate when output
 * files change (so callers can clear JSON caches).
 *
 * Fan-out correctness:
 * - `add` handler fans out into already-known folders.
 * - `addDir` handler fans out all already-known images into the new folder.
 * This ensures images that arrive before their sibling folders still get
 * resized into those folders once they appear, and also handles the case where
 * the initial-scan fires `add` before `addDir` (i.e., chokidar ordering is not
 * guaranteed to be directories-first on all systems).
 *
 * @param {{
 *   inputDir: string,
 *   outDir: string,
 *   allowUpscale: boolean,
 *   onResize: (args: {input: string, output: string, targetFolder: string, imageName: string}) => void,
 *   onInvalidate: () => void,
 *   log: (...args: any[]) => void,
 * }} opts
 * @returns {{ close: () => Promise<void>, ready: Promise<void> }}
 */
export function setupWatcher({ inputDir, outDir, allowUpscale, onResize, onInvalidate, log }) {
  /** Numeric folder names currently present in inputDir */
  const folders = new Set()

  /**
   * Source images indexed by source folder for fan-out when new folders appear.
   * @type {Map<string, Set<string>>} sourceFolder → Set<imageName>
   */
  const sourceImages = new Map()

  const watcher = chokidar.watch(inputDir, {
    depth: 2,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  })

  const ready = new Promise(resolve => watcher.once('ready', resolve))

  watcher.on('addDir', dirPath => {
    const rel = path.relative(inputDir, dirPath)
    const parts = rel.split(path.sep)
    // Only track immediate children of inputDir (depth 1); ignore root '.'
    if (parts.length !== 1 || parts[0] === '') return
    const name = parts[0]
    if (!isValidFolder(name)) return

    folders.add(name)
    log(`Watching folder: ${name}`)

    // Fan out all already-known images into this new folder.
    // This covers two cases:
    //   a) A folder is added after its source images were already processed
    //      (e.g. user creates input/37/ while input/100/hero.jpg already exists).
    //   b) The initial chokidar scan fires 'add' before 'addDir' for the same directory.
    const newNum = parseInt(name, 10)
    for (const [srcFolder, images] of sourceImages) {
      const srcNum = parseInt(srcFolder, 10)
      // name is a valid target for srcFolder when name ≤ srcFolder (or upscale)
      if (allowUpscale || newNum <= srcNum) {
        for (const imageName of images) {
          onResize({
            input: path.join(inputDir, srcFolder, imageName),
            output: path.join(outDir, name, imageName),
            targetFolder: name,
            imageName,
          })
        }
      }
    }
  })

  watcher.on('unlinkDir', dirPath => {
    const rel = path.relative(inputDir, dirPath)
    const parts = rel.split(path.sep)
    if (parts.length === 1) folders.delete(parts[0])
  })

  watcher.on('add', filePath => {
    const rel = path.relative(inputDir, filePath)
    const parts = rel.split(path.sep)
    if (parts.length !== 2) return
    const [sourceFolder, imageName] = parts
    if (!isValidFolder(sourceFolder)) return

    // Record this image so the addDir handler can fan out into future folders
    if (!sourceImages.has(sourceFolder)) sourceImages.set(sourceFolder, new Set())
    sourceImages.get(sourceFolder).add(imageName)

    const targets = getTargetFolders(sourceFolder, [...folders], allowUpscale)
    for (const targetFolder of targets) {
      onResize({
        input: filePath,
        output: path.join(outDir, targetFolder, imageName),
        targetFolder,
        imageName,
      })
    }
  })

  watcher.on('unlink', filePath => {
    const rel = path.relative(inputDir, filePath)
    const parts = rel.split(path.sep)
    if (parts.length !== 2) return
    const [sourceFolder, imageName] = parts

    sourceImages.get(sourceFolder)?.delete(imageName)

    Promise.all(
      [...folders].map(folder =>
        unlink(path.join(outDir, folder, imageName)).catch(() => {
          // Missing file is expected if the resize never completed
        }),
      ),
    ).then(onInvalidate)
  })

  watcher.on('error', err => log(`Watcher error: ${err.message}`))

  return { close: () => watcher.close(), ready }
}
