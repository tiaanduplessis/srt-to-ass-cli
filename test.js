const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const spawnSync = require('child_process').spawnSync
const vm = require('vm')

const cliPath = path.join(__dirname, 'index.js')
const source = fs.readFileSync(cliPath, 'utf8').replace(/^#![^\n]*\n/, '')
let failures = 0
let tests = 0

function test (name, run) {
  tests += 1
  try {
    run()
    console.log(`ok - ${name}`)
  } catch (error) {
    failures += 1
    console.error(`not ok - ${name}`)
    console.error(error.stack)
  }
}

function runMock (args, convert) {
  const logs = []
  const errors = []
  const process = {}
  vm.runInNewContext(source, {
    require: name => {
      if (name === 'get-them-args') return () => args
      if (name === 'srt-to-ass') return { convert }
      throw new Error(`Unexpected module: ${name}`)
    },
    console: {
      log: message => logs.push(message),
      error: error => errors.push(error)
    },
    process
  }, { filename: cliPath })
  return { logs, errors, process }
}

test('success is reported only after conversion completes', () => {
  let conversion
  const result = runMock({ unknown: ['input.srt'] }, function () {
    conversion = Array.prototype.slice.call(arguments)
  })
  assert.deepStrictEqual(result.logs, [])
  assert.strictEqual(conversion[0], 'input.srt')
  assert.strictEqual(conversion[1], 'input.ass')
  assert.strictEqual(JSON.stringify(conversion[2]), '{}')
  assert.strictEqual(typeof conversion[3], 'function')
  conversion[3](null)
  assert.deepStrictEqual(result.logs, ['\ninput.srt has been converted to input.ass!\n'])
  assert.deepStrictEqual(result.errors, [])
  assert.strictEqual(result.process.exitCode, undefined)
})

test('asynchronous failures report the error and a nonzero exit code', () => {
  let complete
  const error = new Error('Output could not be written')
  const result = runMock({ input: 'input.srt', output: 'output.ass' }, (input, output, options, callback) => {
    assert.strictEqual(input, 'input.srt')
    assert.strictEqual(output, 'output.ass')
    complete = callback
  })
  assert.deepStrictEqual(result.logs, [])
  complete(error)
  assert.deepStrictEqual(result.logs, [])
  assert.deepStrictEqual(result.errors, [error])
  assert.strictEqual(result.process.exitCode, 1)
})

test('synchronous conversion failures also use a nonzero exit code', () => {
  const error = new Error('Conversion failed')
  const result = runMock({ unknown: ['input.srt'] }, () => { throw error })
  assert.deepStrictEqual(result.logs, [])
  assert.deepStrictEqual(result.errors, [error])
  assert.strictEqual(result.process.exitCode, 1)
})

const temp = path.join(os.tmpdir(), `srt-to-ass-cli-${process.pid}-${Date.now()}`)
fs.mkdirSync(temp)
const input = path.join(temp, 'input.srt')
fs.writeFileSync(input, '1\n00:00:01,000 --> 00:00:02,000\nHello subtitles!\n')

function runCLI (args) {
  const result = spawnSync(process.execPath, [cliPath].concat(args), {
    cwd: temp,
    encoding: 'utf8',
    timeout: 10000
  })
  assert.ifError(result.error)
  assert.strictEqual(result.signal, null)
  return result
}

function assertASS (output) {
  const content = fs.readFileSync(output, 'utf8')
  assert.ok(content.indexOf('[Script Info]') !== -1)
  assert.ok(content.indexOf('[V4+ Styles]') !== -1)
  assert.ok(content.indexOf('[Events]') !== -1)
  assert.ok(/Dialogue: 0,0:00:01\.00,0:00:02\.00,Default,.*Hello subtitles!/.test(content))
}

function assertFailure (result) {
  assert.strictEqual(result.status, 1)
  assert.strictEqual(result.stdout.indexOf('has been converted'), -1)
  assert.ok(result.stderr.length > 0)
}

try {
  test('positional input produces valid ASS at the default output', () => {
    const result = runCLI([input])
    assert.strictEqual(result.status, 0, result.stderr)
    assert.ok(result.stdout.indexOf(`${input} has been converted to`) !== -1)
    assertASS(path.join(temp, 'input.ass'))
  })

  test('input and output flags produce valid ASS at the requested path', () => {
    const output = path.join(temp, 'custom output.ass')
    const result = runCLI([`--input=${input}`, `--output=${output}`])
    assert.strictEqual(result.status, 0, result.stderr)
    assert.ok(result.stdout.indexOf(`${input} has been converted to ${output}!`) !== -1)
    assertASS(output)
  })

  test('nonexistent input fails without reporting success', () => {
    const output = path.join(temp, 'missing.ass')
    const result = runCLI([path.join(temp, 'missing.srt'), `--output=${output}`])
    assertFailure(result)
    assert.ok(result.stderr.indexOf('ENOENT') !== -1)
    assert.strictEqual(fs.existsSync(output), false)
  })

  test('a missing output parent fails without reporting success', () => {
    const result = runCLI([input, `--output=${path.join(temp, 'missing', 'output.ass')}`])
    assertFailure(result)
    assert.ok(result.stderr.indexOf('ENOENT') !== -1)
  })

  test('an output directory fails without reporting success', () => {
    assertFailure(runCLI([input, `--output=${temp}`]))
  })

  test('omitting the input exits unsuccessfully', () => {
    assertFailure(runCLI([]))
  })
} finally {
  fs.readdirSync(temp).forEach(file => fs.unlinkSync(path.join(temp, file)))
  fs.rmdirSync(temp)
}

console.log(`${tests - failures}/${tests} tests passed`)
if (failures) process.exitCode = 1
