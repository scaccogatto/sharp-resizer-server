// deps
const argv = require('minimist')(process.argv.slice(2))
const chalk = require('chalk')
const _ = require('lodash')
const chokidar = require('chokidar')
const path = require('path')

// utils
const inputDir = _.trim(argv.i)
const dirName = _.trim(argv.c)
const infoLog = chalk.green
const warning = chalk.bold.yellow
const error = chalk.bold.red
const log = (...args) => { console.log(chalk.bgWhite.black('[' + dirName + ']'), ...args) }

// istance data
let images = []
let folders = []

const isValidDir = name => {
  let numberName = _.toNumber(name)
  return !_.isNaN(numberName) && numberName <= _.toNumber(dirName)
}

const writeImage = (outFolder, imageName) => {
  process.send({
    type: 'WRITE',
    data: {
      dirName: dirName,
      size: outFolder,
      imageName,
    }
  })
}

const deleteImage = (outFolder, imageName) => {
  process.send({
    type: 'DELETE',
    data: path.join(outFolder, imageName)
  })
}

const addDir = dir => {
  let parsed = path.parse(dir)

  // check if the directory is less than the current
  if (isValidDir(parsed.name)) {
    // we have a new folder, write all images inside
    images.forEach(i => { writeImage(parsed.name, i) })

    // concat new folder name
    folders = _.concat(folders, parsed.name)
    log(infoLog('adds dir'), parsed.name)
  }
}

const removeDir = dir => {
  folders = _.without(folders, dir)
  log(infoLog('removes dir'), folders)
}

const addImage = imageName => {
  let { name, ext } = path.parse(imageName)
  images = _.concat(images, name + ext)
  log(infoLog('adds image'), name + ext)
  folders.forEach(f => { writeImage(f, name + ext) })
}

const removeImage = imageName => {
  let { name, ext } = path.parse(imageName)
  images = _.without(images, name + ext)
  log(infoLog('removes image'), name + ext)
  folders.forEach(f => { deleteImage(f, name + ext) })
}

// start with inner images
const imagesWatcher = chokidar.watch(path.join(inputDir, dirName), { depth: 1 })
imagesWatcher.on('add', addImage)
imagesWatcher.on('unlink', removeImage)

// start watching the requested directory
const resolutionsWatcher = chokidar.watch(inputDir, { depth: 1 })
resolutionsWatcher.on('addDir', addDir)
resolutionsWatcher.on('unlinkDir', removeDir)
