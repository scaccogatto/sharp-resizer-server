// deps
const argv = require('minimist')(process.argv.slice(2))
const chalk = require('chalk')
const _ = require('lodash')
const chokidar = require('chokidar')
const path = require('path')
const { fork } = require('child_process')
const fs = require('fs-extra')
const PQueue = require('p-queue')
const express = require('express')
const recursive = require("recursive-readdir")

// utils
const inputDir = typeof argv.i !== 'undefined' ? _.trim(argv.i) : 'input'
const outDir = typeof argv.o !== 'undefined' ? _.trim(argv.o) : 'output'
const multiplier = typeof argv.m !== 'undefined' ? _.toInteger(_.trim(argv.m)) / 100 : 1920
const threads =  typeof argv.t !== 'undefined' ? _.toInteger(_.trim(argv.t)) : 1
const port =  typeof argv.p !== 'undefined' ? _.toInteger(_.trim(argv.p)) : 4080
const entryPoint =  typeof argv.e !== 'undefined' ? _.trim(argv.e) : 'images'
const infoLog = chalk.green
const warning = chalk.bold.yellow
const error = chalk.bold.red
const log = (...args) => { console.log(chalk.bgGreen.black('[MASTER]'), ...args) }
const queue = new PQueue({ concurrency: threads })
const app = express()

// istance data
const forks = {}

const forkImageResize = (input, output, size) => {
  return new Promise((resolve, reject) => {
    let child = fork(
      'image-resizer.js',
      [
        '-i ' + input,
        '-o ' + output,
        '-s ' + size
      ]
    )

    child.on('message', m => { if (m.type === 'TERM') resolve() })
  })
}

const readDirWatcherMessage = m => {
  let { type, data } = m

  switch (type) {
    case 'WRITE': {
      let { dirName, size, imageName } = data

      queue.add(() => forkImageResize(
        path.join(inputDir, dirName, imageName),
        path.join(outDir, size, imageName),
        size * multiplier
      ).catch(() => {}))
      break
    }
    case 'DELETE': {
      fs.unlink(path.join(outDir, data), () => {})
      break
    }
  }
}

const isValidDir = name => {
  return !_.isNaN(_.toNumber(name))
}

const watchDir = dir => {
  log(infoLog('Found directory'), dir)

  // directory data
  let parsedDir = path.parse(dir)
  let dirName = parsedDir.name

  // check if fits
  if (isValidDir(dirName)) {
    log(dirName, infoLog('is a valid directory'))

    // add a watcher
    forks[dirName] = fork('directory-watcher.js', ['-i ' + inputDir, '-c ' + dirName])

    // read messages
    forks[dirName].on('message', readDirWatcherMessage)
  }
}

// start with watching the requested directory
const resolutionsWatcher = chokidar.watch(inputDir, { depth: 1 })
resolutionsWatcher.on('addDir', watchDir)

// start API
app.get(`/${entryPoint}/json`, (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  recursive(outDir, (err, files) => {
    // group by image name
    let groups = _.groupBy(_.map(_.map(files, f => path.parse(path.relative(outDir, f))), f => _.assign(f, { group: f.name + f.ext })), 'group')

    // reduce to a readable array
    let reduced = _.map(groups, g => {
      return _.reduce(g, (result, value) => {
        return {
          key: value.group,
          sizes: _.parseInt(value.dir) > _.parseInt(_.trimEnd(result.sizes, 'w')) ? `${value.dir}w` : result.sizes,
          srcset: (_.isUndefined(result.srcset) ? '' : result.srcset + ', ') + `/${entryPoint}/${outDir}/${value.dir}/${value.group} ${value.dir}w`,
          src: _.parseInt(value.dir) > _.parseInt(_.trimEnd(result.sizes, 'w')) ? `/${entryPoint}/${outDir}/${value.dir}/${value.group}` : result.src,
        }
      }, { sizes: '0w' })
    })

    // expose key
    let exposed = _.reduce(reduced, (obj, param) => {
      obj[param.key] = _.omit(param, ['key'])
      return obj
    }, {})

    // send reply
    res.send(JSON.stringify(exposed))
  })
})

// expose images
app.use(`${entryPoint}/${outDir}`, express.static(outDir))

app.listen(port, () => { log(infoLog('API ready', port)) })
