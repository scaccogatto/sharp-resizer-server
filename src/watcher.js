import chokidar from 'chokidar'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { isValidFolder, getTargetFolders } from './srcset.js'

/**
 * Sets up a chokidar watcher on inputDir.
 * Fires onResize when an image is added to a numeric subfolder and
 * onInvalidate when any output file is deleted (so callers can clear caches).
 *
 * @param {{
 *   inputDir: string,
 *   outDir: string,
 *   allowUpscale: boolean,
 *   onResize: (args: {input: string, output: string, targetFolder: string, imageName: string}) => void,
 *   onInvalidate: () => void,
 *   log: (...args: any[]) => void,
 * }} opts
 * @returns {() => Promise<void>} Async cleanup function
 */
export function setupWatcher({ inputDir, outDir, allowUpscale, onResize, onInvalidate, log }) {
  /** Numeric folder names currently present in inputDir */
  const folders = new Set()

  const watcher = chokidar.watch(inputDir, {
    depth: 2,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  })

  watcher.on('addDir', dirPath => {
    const rel = path.relative(inputDir, dirPath)
    const parts = rel.split(path.sep)
    // Only track immediate children of inputDir (depth 1); ignore root '.'
    if (parts.length === 1 && parts[0] !== '') {
      const name = parts[0]
      if (isValidFolder(name)) {
        folders.add(name)
        log(`Watching folder: ${name}`)
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
    // Only handle files exactly one level inside a tracked numeric dir
    if (parts.length !== 2) return
    const [sourceFolder, imageName] = parts
    if (!isValidFolder(sourceFolder)) return

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
    const [, imageName] = parts

    // Delete the resized copies from every tracked output folder
    Promise.all(
      [...folders].map(folder =>
        unlink(path.join(outDir, folder, imageName)).catch(() => {
          // Ignore missing-file errors — the copy may never have been created
        }),
      ),
    ).then(onInvalidate)
  })

  watcher.on('error', err => log(`Watcher error: ${err.message}`))

  return () => watcher.close()
}
