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
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const noop = () => {}

let tmpDir
let inputDir
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

/** Waits up to `ms` milliseconds for `predicate` to return true, polling every 50 ms. */
async function waitFor(predicate, ms = 3000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(r => setTimeout(r, 50))
  }
  throw new Error('waitFor timed out')
}

describe('setupWatcher fan-out', () => {
  it('resizes an image into an already-tracked folder when the image is added', async () => {
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
    await ready

    // Add an image AFTER the watcher is ready and folder-100 is already tracked
    await writeFile(path.join(inputDir, '100', 'hero.jpg'), 'fake-image')
    await waitFor(() => calls.some(c => c.imageName === 'hero.jpg' && c.targetFolder === '100'))

    await close()

    const heroIn100 = calls.find(c => c.imageName === 'hero.jpg' && c.targetFolder === '100')
    expect(heroIn100).toBeDefined()
    expect(heroIn100.input).toBe(path.join(inputDir, '100', 'hero.jpg'))
    expect(heroIn100.output).toBe(path.join(outDir, '100', 'hero.jpg'))
  })

  it('fans out an existing image into a newly-created sibling folder (the addDir regression)', async () => {
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
    await ready

    // Clear any initial-scan calls so we see only the fan-out call
    calls.length = 0

    // Create a new smaller folder — hero.jpg should be fanned out into it
    await mkdir(path.join(inputDir, '37'))
    await waitFor(() => calls.some(c => c.imageName === 'hero.jpg' && c.targetFolder === '37'))

    await close()

    const fanOut = calls.find(c => c.imageName === 'hero.jpg' && c.targetFolder === '37')
    expect(fanOut).toBeDefined()
    expect(fanOut.input).toBe(path.join(inputDir, '100', 'hero.jpg'))
    expect(fanOut.output).toBe(path.join(outDir, '37', 'hero.jpg'))
  })

  it('does NOT fan out into a larger folder without --allow-upscale', async () => {
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
    await ready
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
    await ready
    calls.length = 0

    await mkdir(path.join(inputDir, '100'))
    await waitFor(() => calls.some(c => c.imageName === 'small.jpg' && c.targetFolder === '100'))

    await close()

    const fanOut = calls.find(c => c.imageName === 'small.jpg' && c.targetFolder === '100')
    expect(fanOut).toBeDefined()
  })
})
