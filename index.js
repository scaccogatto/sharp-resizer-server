// Resolves issue #7: replaced minimist with commander for typed options, --help, and validation.
import { program } from 'commander'
import chalk from 'chalk'
import PQueue from 'p-queue'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createApp } from './src/app.js'
import { setupWatcher } from './src/watcher.js'
import { resizeImage } from './src/resizer.js'

program
  .name('sharp-resizer-server')
  .description('Watch an input directory tree and serve srcset-ready resized images over HTTP.')
  .option('-i, --input <dir>', 'input directory to watch', 'input')
  .option('-o, --output <dir>', 'output directory for resized images', 'output')
  .option(
    '-m, --multiplier <number>',
    'pixel width when folder name is 100 (e.g. 1920 → folder-100 images become 1920 px wide)',
    '1920',
  )
  .option('-t, --threads <number>', 'max concurrent resize operations', '1')
  .option('-p, --port <number>', 'HTTP port', '4080')
  .option('-e, --entry <path>', 'URL entry point', 'images')
  .option('--allow-upscale', 'resize images into folders larger than their source folder (issue #2)')
  .parse()

const opts = program.opts()

const inputDir = path.resolve(opts.input)
const outDir = path.resolve(opts.output)
// outDirName is the path fragment used in URLs — keep as-is (relative)
const outDirName = opts.output
const entryPoint = opts.entry
const multiplier = parseInt(opts.multiplier, 10) / 100
const threads = parseInt(opts.threads, 10)
const port = parseInt(opts.port, 10)
const allowUpscale = Boolean(opts.allowUpscale)

const log = (...args) => console.log(chalk.bgGreen.black('[MASTER]'), ...args)

await mkdir(outDir, { recursive: true })

const queue = new PQueue({ concurrency: threads })
const { app, cache } = createApp({ outDir, outDirName, entryPoint })

setupWatcher({
  inputDir,
  outDir,
  allowUpscale,
  log,
  onResize: ({ input, output, targetFolder, imageName }) => {
    queue.add(async () => {
      const widthPx = Math.round(parseInt(targetFolder, 10) * multiplier)
      log(chalk.green(`Queuing ${imageName} → ${targetFolder}/ (${widthPx}px)`))
      const ok = await resizeImage(input, output, widthPx)
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

app.listen(port, () => log(chalk.green(`API ready → http://localhost:${port}/${entryPoint}/json`)))
