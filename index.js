#! /usr/bin/env node

const sub = require('srt-to-ass')

try {
  const args = require('get-them-args')()
  const input = args.input || args.unknown[0]
  if (!input) throw new Error('An input SRT file is required')
  const output = args.output || `${input.slice(0, input.indexOf('.srt'))}.ass`
  const options = {}
  if (Object.prototype.hasOwnProperty.call(args, 'style')) {
    options.style = require('./style')(args.style)
  }
  sub.convert(input, output, options, error => {
    if (error) {
      console.error(error)
      process.exitCode = 1
      return
    }
    console.log(`\n${input} has been converted to ${output}!\n`)
  })
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
