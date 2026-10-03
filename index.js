#! /usr/bin/env node

const args = require('get-them-args')()
const sub = require('srt-to-ass')

try {
  const input = args.input || args.unknown[0]
  if (!input) throw new Error('An input SRT file is required')
  const output = args.output || `${input.slice(0, input.indexOf('.srt'))}.ass`
  sub.convert(input, output, {}, error => {
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
