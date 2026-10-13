import chokidar from 'chokidar'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { isValidFolder, getTargetFolders, CONVERTIBLE_FORMATS } from './srcset.js'

/**
 * Output file names a source image can produce in a size folder: the image itself
 * plus one `<stem>.<format>` sibling per --formats entry.
 * @param {string} imageName
 * @returns {string[]}
 */
export function outputsOf(imageName) {
  const { name: stem } = path.parse(imageName)
  return [...new Set([imageName, ...CONVERTIBLE_FORMATS.map(fmt => `${stem}.${fmt}`)])]
}

/**
 * Sets up a chokidar watcher on inputDir.
 *
 * Fires onResize when an image should be resized and onInvalidate when output
 * files change (so callers can clear JSON caches).
 *
 * Fan-out correctness:
 * - `add` and `change` handlers (re)render into already-known folders.
 * - `unlink` deletes the outputs (including --formats siblings) unless another
 *   source image still produces the same output file, which is re-rendered instead.
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
  /**
   * Numeric folder names currently present in inputDir
   * @type {Set<string>}
   */
  const folders = new Set()

  /**
   * Path segments of p relative to inputDir ('' for inputDir itself).
   * @param {string} p
   */
  const relParts = p => path.relative(inputDir, p).split(path.sep)

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

  /** @type {Promise<void>} */
  const ready = new Promise(resolve => watcher.once('ready', () => resolve()))

  watcher.on('addDir', dirPath => {
    const [name, ...rest] = relParts(dirPath)
    // Only track immediate children of inputDir (depth 1), ignore the root itself
    if (name === undefined || name === '' || rest.length > 0) return
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
    const [name, ...rest] = relParts(dirPath)
    if (name !== undefined && rest.length === 0) folders.delete(name)
  })

  /**
   * True when sourceFolder is allowed to render into targetFolder.
   * @param {string} sourceFolder
   * @param {string} targetFolder
   */
  const targets = (sourceFolder, targetFolder) =>
    getTargetFolders(sourceFolder, [targetFolder], allowUpscale).length > 0

  /**
   * Handles a new or modified source image: (re)renders it into every target folder.
   * @param {string} filePath
   */
  const renderSource = filePath => {
    const [sourceFolder, imageName, ...rest] = relParts(filePath)
    if (sourceFolder === undefined || imageName === undefined || rest.length > 0) return
    if (!isValidFolder(sourceFolder)) return

    // Record this image so the addDir handler can fan out into future folders
    let images = sourceImages.get(sourceFolder)
    if (!images) {
      images = new Set()
      sourceImages.set(sourceFolder, images)
    }
    if (!images.has(imageName)) {
      images.add(imageName)
      const clashes = [...sourceImages]
        .filter(([folder, names]) => folder !== sourceFolder && names.has(imageName))
        .map(([folder]) => folder)
      if (clashes.length > 0) {
        log(
          `Warning: ${imageName} exists in source folders ${[sourceFolder, ...clashes].join(', ')}: ` +
            'they share output files, the last one rendered wins',
        )
      }
    }

    for (const targetFolder of getTargetFolders(sourceFolder, [...folders], allowUpscale)) {
      onResize({
        input: filePath,
        output: path.join(outDir, targetFolder, imageName),
        targetFolder,
        imageName,
      })
    }
  }

  watcher.on('add', renderSource)
  // Overwriting a source in place must re-render its outputs too
  watcher.on('change', renderSource)

  watcher.on('unlink', filePath => {
    const [sourceFolder, imageName, ...rest] = relParts(filePath)
    if (sourceFolder === undefined || imageName === undefined || rest.length > 0) return

    sourceImages.get(sourceFolder)?.delete(imageName)

    // Remaining sources, largest folder first so a re-render uses the best original
    const remaining = [...sourceImages]
      .filter(([, names]) => names.size > 0)
      .sort(([a], [b]) => parseInt(b, 10) - parseInt(a, 10))

    /** @type {Map<string, {input: string, output: string, targetFolder: string, imageName: string}>} */
    const rerenders = new Map()
    /** @type {string[]} */
    const toDelete = []

    for (const folder of folders) {
      for (const output of outputsOf(imageName)) {
        // Another source image may still produce this exact output file: re-render
        // it from that source instead of deleting what it owns.
        const owner = remaining
          .filter(([srcFolder]) => targets(srcFolder, folder))
          .flatMap(([srcFolder, names]) => [...names].map(name => ({ srcFolder, name })))
          .find(({ name }) => outputsOf(name).includes(output))

        if (owner) {
          rerenders.set(`${owner.srcFolder}/${owner.name}->${folder}`, {
            input: path.join(inputDir, owner.srcFolder, owner.name),
            output: path.join(outDir, folder, owner.name),
            targetFolder: folder,
            imageName: owner.name,
          })
        } else {
          toDelete.push(path.join(outDir, folder, output))
        }
      }
    }

    Promise.all(
      toDelete.map(file =>
        unlink(file).catch(() => {
          // Missing file is expected if the resize never completed or no format was emitted
        }),
      ),
    ).then(() => {
      for (const args of rerenders.values()) onResize(args)
      onInvalidate()
    })
  })

  watcher.on('error', err => log(`Watcher error: ${err instanceof Error ? err.message : String(err)}`))

  return { close: () => watcher.close(), ready }
}
