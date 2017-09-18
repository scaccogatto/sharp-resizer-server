// deps
const argv = require('minimist')(process.argv.slice(2))
const chalk = require('chalk')
const _ = require('lodash')
const fs = require('fs-extra')
const path = require('path')
const sharp = require('sharp')

// utils
const inputFile = _.trim(argv.i)
const size = _.toInteger(_.trim(argv.s))
const outputFile = _.trim(argv.o)
const infoLog = chalk.bold.green
const warning = chalk.bold.yellow
const error = chalk.bold.red
const log = (...args) => { console.log(chalk.bgMagenta.black('[SHARP]'), ...args) }

const writeCallback = (err, info) => {
  if (err) log(error('cannot write file'), outputFile, err)
  else {
    log(infoLog('wrote'), outputFile)
    process.send({
      type: 'TERM'
    })
  }
}

// ensure the directory existance
fs.ensureDirSync(path.dirname(outputFile))

// resize!
sharp(inputFile)
  .resize(size)
  .toFile(outputFile, writeCallback)
