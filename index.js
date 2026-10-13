#!/usr/bin/env node
// Resolves issue #7: commander provides typed, validated options and --help.
import { program } from 'commander'
import chalk from 'chalk'
import PQueue from 'p-queue'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createApp } from './src/app.js'
import { setupWatcher } from './src/watcher.js'
import { resizeImage } from './src/resizer.js'
import { CONVERTIBLE_FORMATS, folderWidth } from './src/srcset.js'
import { parseEntry, parseFormats, parsePort, parsePositiveInt, outputUrlSegment } from './src/cli.js'

program
  .name('sharp-resizer-server')
  .description('Watch an input directory tree and serve srcset-ready resized images over HTTP.')
  .option('-i, --input <dir>', 'input directory to watch', 'input')
  .option('-o, --output <dir>', 'output directory for resized images, served under its last path segment', 'output')
  .option(
    '-m, --multiplier <number>',
    'pixel width when folder name is 100 (e.g. 1920: folder-100 images become 1920 px wide)',
    parsePositiveInt,
    1920,
  )
  .option('-t, --threads <number>', 'max concurrent resize operations', parsePositiveInt, 1)
  .option('-p, --port <number>', 'HTTP port', parsePort, 4080)
  .option('-e, --entry <path>', 'URL entry point', parseEntry, 'images')
  .option('--allow-upscale', 'resize images into folders larger than their source folder (issue #2)')
  .option(
    '--formats <list>',
    `comma-separated extra formats to also emit alongside the original (${CONVERTIBLE_FORMATS.join(', ')})`,
    parseFormats,
    [],
  )
  .parse()

/** @type {{input: string, output: string, multiplier: number, threads: number, port: number, entry: string, allowUpscale?: boolean, formats: import('./src/srcset.js').ConvertibleFormat[]}} */
const opts = program.opts()

const inputDir = path.resolve(opts.input)
const outDir = path.resolve(opts.output)

/** @type {string} */
let outDirName
try {
  outDirName = outputUrlSegment(opts.output)
} catch (err) {
  program.error(`error: option '-o, --output <dir>' ${/** @type {Error} */ (err).message}`)
}

const entryPoint = opts.entry
const multiplier = opts.multiplier / 100
const allowUpscale = Boolean(opts.allowUpscale)
const formats = opts.formats

/** @param {...unknown} args */
const log = (...args) => console.log(chalk.bgGreen.black('[MASTER]'), ...args)

await mkdir(outDir, { recursive: true })

const queue = new PQueue({ concurrency: opts.threads })
const { app, cache } = createApp({ outDir, outDirName, entryPoint, multiplier })

setupWatcher({
  inputDir,
  outDir,
  allowUpscale,
  log,
  onResize: ({ input, output, targetFolder, imageName }) => {
    queue.add(async () => {
      const widthPx = folderWidth(targetFolder, multiplier)
      log(chalk.green(`Queuing ${imageName} → ${targetFolder}/ (${widthPx}px)`))
      const ok = await resizeImage(input, output, widthPx, formats)
      // Invalidate JSON cache so the next GET reflects the new file (issue #8)
      if (ok) {
        cache.invalidate()
        log(chalk.green(`Done ${imageName} → ${targetFolder}/`))
      } else {
        log(chalk.bold.red(`Failed to resize ${imageName} → ${targetFolder}/`))
      }
    })
  },
  onInvalidate: () => cache.invalidate(),
})

app.listen(opts.port, () => log(chalk.green(`API ready → http://localhost:${opts.port}/${entryPoint}/json`)))
