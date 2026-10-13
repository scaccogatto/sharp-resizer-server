/**
 * Integration tests for setupWatcher.
 *
 * These use a real chokidar watcher against a temp filesystem.
 * They verify the fan-out behaviour that automated srcset-logic tests
 * cannot exercise: images present before a folder appears must still
 * be resized into that folder when it is created.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupWatcher } from '../src/watcher.js'
import { mkdtemp, mkdir, rm, writeFile, unlink, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const noop = () => {}

/** @typedef {{input: string, output: string, targetFolder: string, imageName: string}} ResizeCall */

/** @type {string} */
let tmpDir
/** @type {string} */
let inputDir
/** @type {string} */
let outDir

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'sharp-watcher-test-'))
  inputDir = path.join(tmpDir, 'input')
  outDir = path.join(tmpDir, 'output')
  await mkdir(inputDir, { recursive: true })
  await mkdir(outDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

/**
 * Waits up to `ms` milliseconds for `predicate` to return true, polling every 50 ms.
 * @param {() => boolean} predicate
 */
async function waitFor(predicate, ms = 3000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(r => setTimeout(r, 50))
  }
  throw new Error('waitFor timed out')
}

/**
 * Waits for the watcher to be ready, then lets the native watch handles arm.
 * On macOS, fs.watch is backed by FSEvents, whose stream can start a few ms
 * after chokidar emits 'ready': a directory created inside that window is
 * never reported, which made the fan-out tests flaky locally.
 * @param {Promise<void>} ready
 */
async function armed(ready) {
  await ready
  await new Promise(r => setTimeout(r, 100))
}

describe('setupWatcher fan-out', () => {
  it('resizes an image into an already-tracked folder when the image is added', async () => {
    /** @type {ResizeCall[]} */
    const calls = []
    await mkdir(path.join(inputDir, '100'))

    const { close, ready } = setupWatcher({
      inputDir,
      outDir,
      allowUpscale: false,
      onResize: args => calls.push(args),
      onInvalidate: noop,
      log: noop,
    })
    await armed(ready)

    // Add an image AFTER the watcher is ready and folder-100 is already tracked
    await writeFile(path.join(inputDir, '100', 'hero.jpg'), 'fake-image')
    await waitFor(() => calls.some(c => c.imageName === 'hero.jpg' && c.targetFolder === '100'))

    await close()

    const heroIn100 = calls.find(c => c.imageName === 'hero.jpg' && c.targetFolder === '100')
    expect(heroIn100).toBeDefined()
    expect(heroIn100?.input).toBe(path.join(inputDir, '100', 'hero.jpg'))
    expect(heroIn100?.output).toBe(path.join(outDir, '100', 'hero.jpg'))
  })

  it('fans out an existing image into a newly-created sibling folder (the addDir regression)', async () => {
    /** @type {ResizeCall[]} */
    const calls = []
    await mkdir(path.join(inputDir, '100'))
    await writeFile(path.join(inputDir, '100', 'hero.jpg'), 'fake-image')

    const { close, ready } = setupWatcher({
      inputDir,
      outDir,
      allowUpscale: false,
      onResize: args => calls.push(args),
      onInvalidate: noop,
      log: noop,
    })
    await armed(ready)

    // Clear any initial-scan calls so we see only the fan-out call
    calls.length = 0

    // Create a new smaller folder — hero.jpg should be fanned out into it
    await mkdir(path.join(inputDir, '37'))
    await waitFor(() => calls.some(c => c.imageName === 'hero.jpg' && c.targetFolder === '37'))

    await close()

    const fanOut = calls.find(c => c.imageName === 'hero.jpg' && c.targetFolder === '37')
    expect(fanOut).toBeDefined()
    expect(fanOut?.input).toBe(path.join(inputDir, '100', 'hero.jpg'))
    expect(fanOut?.output).toBe(path.join(outDir, '37', 'hero.jpg'))
  })

  it('does NOT fan out into a larger folder without --allow-upscale', async () => {
    /** @type {ResizeCall[]} */
    const calls = []
    await mkdir(path.join(inputDir, '37'))
    await writeFile(path.join(inputDir, '37', 'small.jpg'), 'fake-image')

    const { close, ready } = setupWatcher({
      inputDir,
      outDir,
      allowUpscale: false,
      onResize: args => calls.push(args),
      onInvalidate: noop,
      log: noop,
    })
    await armed(ready)
    calls.length = 0

    // Create a LARGER folder — small.jpg should NOT be fanned out without upscale
    await mkdir(path.join(inputDir, '100'))
    // Wait long enough for the addDir event to settle
    await new Promise(r => setTimeout(r, 500))

    await close()

    const badFanOut = calls.find(c => c.imageName === 'small.jpg' && c.targetFolder === '100')
    expect(badFanOut).toBeUndefined()
  })

  it('fans out into a larger folder when --allow-upscale is set (issue #2)', async () => {
    /** @type {ResizeCall[]} */
    const calls = []
    await mkdir(path.join(inputDir, '37'))
    await writeFile(path.join(inputDir, '37', 'small.jpg'), 'fake-image')

    const { close, ready } = setupWatcher({
      inputDir,
      outDir,
      allowUpscale: true,
      onResize: args => calls.push(args),
      onInvalidate: noop,
      log: noop,
    })
    await armed(ready)
    calls.length = 0

    await mkdir(path.join(inputDir, '100'))
    await waitFor(() => calls.some(c => c.imageName === 'small.jpg' && c.targetFolder === '100'))

    await close()

    const fanOut = calls.find(c => c.imageName === 'small.jpg' && c.targetFolder === '100')
    expect(fanOut).toBeDefined()
  })
})

/**
 * Resolves true when the file exists.
 * @param {string} file
 */
const exists = file =>
  access(file).then(
    () => true,
    () => false,
  )

/**
 * Writes a file, creating its parent directory.
 * @param {string} file
 * @param {string} content
 */
async function put(file, content = 'x') {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
}

describe('setupWatcher source edits', () => {
  it('re-renders a source image that is overwritten in place', async () => {
    /** @type {ResizeCall[]} */
    const calls = []
    await mkdir(path.join(inputDir, '100'))
    await mkdir(path.join(inputDir, '37'))
    await writeFile(path.join(inputDir, '100', 'hero.jpg'), 'v1')

    const { close, ready } = setupWatcher({
      inputDir,
      outDir,
      allowUpscale: false,
      onResize: args => calls.push(args),
      onInvalidate: noop,
      log: noop,
    })
    await armed(ready)
    await waitFor(() => calls.filter(c => c.imageName === 'hero.jpg').length >= 2)
    calls.length = 0

    await writeFile(path.join(inputDir, '100', 'hero.jpg'), 'v2 with different bytes')
    await waitFor(() => ['100', '37'].every(f => calls.some(c => c.imageName === 'hero.jpg' && c.targetFolder === f)))

    await close()
  })
})

describe('setupWatcher source deletion', () => {
  it('removes the original and its --formats siblings from every size folder', async () => {
    let invalidated = 0
    await mkdir(path.join(inputDir, '100'))
    await mkdir(path.join(inputDir, '37'))
    await writeFile(path.join(inputDir, '100', 'hero.jpg'), 'x')
    const outputs = ['100', '37'].flatMap(f =>
      ['hero.jpg', 'hero.webp', 'hero.avif'].map(n => path.join(outDir, f, n)),
    )
    await Promise.all(outputs.map(file => put(file)))
    // An unrelated output must survive
    await put(path.join(outDir, '100', 'other.jpg'))

    const { close, ready } = setupWatcher({
      inputDir,
      outDir,
      allowUpscale: false,
      onResize: noop,
      onInvalidate: () => invalidated++,
      log: noop,
    })
    await armed(ready)

    await unlink(path.join(inputDir, '100', 'hero.jpg'))
    await waitFor(() => invalidated > 0)
    await close()

    for (const file of outputs) expect(await exists(file), file).toBe(false)
    expect(await exists(path.join(outDir, '100', 'other.jpg'))).toBe(true)
  })

  it('keeps and re-renders outputs that another source folder still produces', async () => {
    /** @type {ResizeCall[]} */
    const calls = []
    let invalidated = 0
    const logs = /** @type {string[]} */ ([])
    await mkdir(path.join(inputDir, '100'))
    await mkdir(path.join(inputDir, '72'))
    await mkdir(path.join(inputDir, '37'))
    await writeFile(path.join(inputDir, '100', 'a.jpg'), 'big')
    await writeFile(path.join(inputDir, '72', 'a.jpg'), 'small')
    for (const f of ['100', '72', '37']) await put(path.join(outDir, f, 'a.jpg'))

    const { close, ready } = setupWatcher({
      inputDir,
      outDir,
      allowUpscale: false,
      onResize: args => calls.push(args),
      onInvalidate: () => invalidated++,
      log: (...args) => logs.push(args.join(' ')),
    })
    await armed(ready)
    await waitFor(() => logs.some(l => l.includes('Warning: a.jpg exists in source folders')))
    calls.length = 0

    // Deleting the folder-100 source: 72/ and 37/ still belong to input/72/a.jpg
    await unlink(path.join(inputDir, '100', 'a.jpg'))
    await waitFor(() => invalidated > 0)
    await close()

    expect(await exists(path.join(outDir, '100', 'a.jpg'))).toBe(false)
    expect(await exists(path.join(outDir, '72', 'a.jpg'))).toBe(true)
    expect(await exists(path.join(outDir, '37', 'a.jpg'))).toBe(true)
    expect(calls.map(c => [c.input, c.targetFolder]).sort()).toEqual([
      [path.join(inputDir, '72', 'a.jpg'), '37'],
      [path.join(inputDir, '72', 'a.jpg'), '72'],
    ])
  })
})
