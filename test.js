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
      if (name === 'get-them-args') {
        return () => {
          if (args instanceof Error) throw args
          return args
        }
      }
      if (name === 'srt-to-ass') return { convert }
      if (name === './style') return require('./style')
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

  const styleFile = (content, filename) => {
    const file = path.join(temp, filename || 'style.json')
    fs.writeFileSync(file, content)
    return file
  }

  const styleColumns = (output) => {
    return fs.readFileSync(output, 'utf8').split(/\r?\n/).filter(line => line.indexOf('Style: ') === 0)[0].slice(7).split(',')
  }

  const baseline = fs.readFileSync(path.join(temp, 'input.ass'), 'utf8')
  const fullStyle = {
    font: { family: 'Agency:Bold', size: 27.5, scale: { x: 0, y: 125.5 } },
    color: { primary: '&H80123456', secondary: '&Hffabcdef', outline: '&H00000000', background: '&HFFFFFFFF' },
    bold: -1,
    italic: 0,
    underline: -1,
    strikeout: 0,
    spacing: -1.5,
    angle: -45.5,
    border: { style: 3, outline: 0, shadow: 0 },
    alignment: 9,
    margin: { left: 0, right: 12, vertical: 0 },
    encoding: 255
  }

  test('custom style renders all 22 fields and keeps Default dialogue references', () => {
    const output = path.join(temp, 'styled.ass')
    const file = styleFile(JSON.stringify(fullStyle), 'custom style.json')
    const result = runCLI([input, '--style', file, '--output', output])
    assert.strictEqual(result.status, 0, result.stderr)
    assertASS(output)
    assert.deepStrictEqual(styleColumns(output), [
      'Default', 'Agency:Bold', '27.5', '&H80123456', '&Hffabcdef', '&H00000000', '&HFFFFFFFF',
      '-1', '0', '-1', '0', '0', '125.5', '-1.5', '-45.5', '3', '0', '0', '9', '0', '12', '0', '255'
    ])
    const withoutStyle = value => value.replace(/^Style: .*$/m, '')
    assert.strictEqual(withoutStyle(fs.readFileSync(output, 'utf8')), withoutStyle(baseline))
  })

  test('style equals form accepts relative paths with spaces and preserves unspecified defaults', () => {
    styleFile('{"font":{"size":48}}', 'partial style.json')
    const output = path.join(temp, 'partial.ass')
    const result = runCLI([`--input=${input}`, '--style=partial style.json', `--output=${output}`])
    assert.strictEqual(result.status, 0, result.stderr)
    const expected = styleColumns(path.join(temp, 'input.ass'))
    expected[2] = '48'
    assert.deepStrictEqual(styleColumns(output), expected)
  })

  test('empty style and empty nested branches preserve default output byte for byte', () => {
    ['{}', '{"font":{"scale":{}},"color":{},"border":{},"margin":{}}'].forEach(content => {
      const file = styleFile(content)
      const output = path.join(temp, 'empty.ass')
      const result = runCLI([input, `--style=${file}`, `--output=${output}`])
      assert.strictEqual(result.status, 0, result.stderr)
      assert.strictEqual(fs.readFileSync(output, 'utf8'), baseline)
    })
  })

  test('style paths support parent traversal and symlinks to regular files', () => {
    const file = styleFile('{"bold":-1}')
    const alias = path.join(temp, 'style-link.json')
    fs.symlinkSync(file, alias)
    const relative = path.join('..', path.basename(temp), 'style-link.json')
    const result = runCLI([input, `--style=${relative}`])
    assert.strictEqual(result.status, 0, result.stderr)
    assert.strictEqual(styleColumns(path.join(temp, 'input.ass'))[7], '-1')
  })

  test('duplicate style flags retain the existing last value wins behavior', () => {
    const file = styleFile('{"bold":-1}')
    const result = runCLI([input, '--style=does-not-exist.json', `--style=${file}`])
    assert.strictEqual(result.status, 0, result.stderr)
    assert.strictEqual(styleColumns(path.join(temp, 'input.ass'))[7], '-1')
  })

  test('validated style options keep success delayed until the callback', () => {
    let complete
    const file = styleFile(JSON.stringify(fullStyle))
    const result = runMock({ unknown: [input], style: file }, (input, output, options, callback) => {
      assert.deepStrictEqual(options.style, fullStyle)
      complete = callback
    })
    assert.deepStrictEqual(result.logs, [])
    complete(null)
    assert.strictEqual(result.logs.length, 1)
    assert.deepStrictEqual(result.errors, [])
  })

  test('valid styles retain asynchronous and synchronous conversion error handling', () => {
    const file = styleFile('{}')
    const error = new Error('Conversion failed with style')
    ;[false, true].forEach(synchronous => {
      const result = runMock({ unknown: [input], style: file }, (input, output, options, callback) => {
        if (synchronous) throw error
        callback(error)
      })
      assert.deepStrictEqual(result.logs, [])
      assert.deepStrictEqual(result.errors, [error])
      assert.strictEqual(result.process.exitCode, 1)
    })
    const result = runCLI([input, `--style=${file}`, `--output=${path.join(temp, 'missing', 'styled.ass')}`])
    assertFailure(result)
    assert.ok(result.stderr.indexOf('ENOENT') !== -1)
  })

  test('parser errors are caught before conversion', () => {
    const error = new Error('Argument parsing failed')
    const result = runMock(error, () => { throw new Error('Must not convert') })
    assert.deepStrictEqual(result.logs, [])
    assert.deepStrictEqual(result.errors, [error])
    assert.strictEqual(result.process.exitCode, 1)
    assertFailure(runCLI([input, '--style={']))
  })

  const assertRejected = (file, message) => {
    let called = false
    const result = runMock({ unknown: [input], style: file }, () => { called = true })
    assert.strictEqual(called, false)
    assert.deepStrictEqual(result.logs, [])
    assert.strictEqual(result.process.exitCode, 1)
    assert.strictEqual(result.errors.length, 1)
    assert.ok(result.errors[0].message.indexOf(message) !== -1, result.errors[0].message)
    const output = path.join(temp, 'rejected.ass')
    if (fs.existsSync(output)) fs.unlinkSync(output)
    const fresh = runCLI([input, `--style=${file}`, `--output=${output}`])
    assertFailure(fresh)
    assert.ok(fresh.stderr.indexOf(message) !== -1, fresh.stderr)
    assert.strictEqual(fs.existsSync(output), false)
    fs.writeFileSync(output, 'do not overwrite')
    const existing = runCLI([input, `--style=${file}`, `--output=${output}`])
    assertFailure(existing)
    assert.strictEqual(fs.readFileSync(output, 'utf8'), 'do not overwrite')
    assert.strictEqual(Object.prototype.stylePolluted, undefined)
  }

  test('missing, empty and non-string style arguments fail before conversion', () => {
    [true, false, null, 1, '', '   ', {}, []].forEach(value => {
      let called = false
      const result = runMock({ unknown: [input], style: value }, () => { called = true })
      assert.strictEqual(called, false)
      assert.deepStrictEqual(result.logs, [])
      assert.strictEqual(result.process.exitCode, 1)
      assert.ok(result.errors[0].message.indexOf('--style requires a JSON file path') !== -1)
    })
    ;['--style', '--style=', '--style=false', '--style=null', '--style=1', '--style={}'].forEach(flag => {
      const output = path.join(temp, 'bad-argument.ass')
      fs.writeFileSync(output, 'do not overwrite')
      const result = runCLI([input, `--output=${output}`, flag])
      assertFailure(result)
      assert.ok(result.stderr.indexOf('--style requires a JSON file path') !== -1, result.stderr)
      assert.strictEqual(fs.readFileSync(output, 'utf8'), 'do not overwrite')
    })
  })

  test('missing and non-regular style files fail before conversion', () => {
    assertRejected(path.join(temp, 'missing-style.json'), 'Cannot read style file')
    assertRejected(temp, 'regular file')
  })

  test('unreadable style files fail before conversion', () => {
    const file = styleFile('{}', 'unreadable.json')
    fs.chmodSync(file, 0)
    try {
      if (typeof process.getuid !== 'function' || process.getuid() !== 0) assertRejected(file, 'Cannot read style file')
    } finally {
      fs.chmodSync(file, 0o600)
    }
  })

  const atPath = (property, value) => {
    return property.split('.').reverse().reduce((object, key) => {
      const result = {}
      result[key] = object
      return result
    }, value)
  }

  const invalid = [
    ['malformed JSON', '{', 'Invalid JSON'],
    ['NaN JSON', '{"spacing":NaN}', 'Invalid JSON'],
    ['overflow', '{"spacing":1e309}', 'style.spacing'],
    ['wrapped style', '{"style":{}}', 'style.style'],
    ['unsupported name', '{"name":"Alternate"}', 'style.name'],
    ['unknown property', '{"unexpected":true}', 'style.unexpected'],
    ['wrong nesting', '{"font":{"alignment":1}}', 'style.font.alignment']
  ]
  ;[null, [], 'text', 0, true].forEach(value => invalid.push(['root ' + JSON.stringify(value), JSON.stringify(value), 'style must be a JSON object']))
  ;['font', 'font.scale', 'color', 'border', 'margin'].forEach(property => {
    ;[null, [], 0, false, 'string'].forEach(value => {
      invalid.push([property + ' shape ' + JSON.stringify(value), JSON.stringify(atPath(property, value)), 'style.' + property])
    })
  })
  const invalidValues = {
    'font.family': ['', '   ', 'Arial,Injected', 'Arial\nInjected', 'Arial\rInjected', 'Arial\x00Injected', 'Arial\x1fInjected', 'Arial\x7fInjected', 4, {}, []],
    'font.size': [0, -1, '48', true, null, {}],
    'font.scale.x': [-1, '100', null],
    'font.scale.y': [-1, false, []],
    'color.primary': ['#FFFFFF', '&HFFFFFF', '&H0000000G', '&h00FFFFFF', '&H00FFFFFF\n', 1],
    'color.secondary': ['bad', null],
    'color.outline': ['bad', {}],
    'color.background': ['bad', []],
    bold: [1, true, '-1', null],
    italic: [1, false],
    underline: [-2, '0'],
    strikeout: [2, {}],
    spacing: ['2', null, false, {}],
    angle: ['-45', null, true, []],
    'border.style': [0, 2, 4, '1', true],
    'border.outline': [-1, '0', null],
    'border.shadow': [-1, false, []],
    alignment: [0, 10, 1.5, '2', null],
    'margin.left': [-1, 0.5, '5'],
    'margin.right': [-1, 0.5, true],
    'margin.vertical': [-1, 0.5, null],
    encoding: [-1, 256, 1.5, '0', false]
  }
  Object.keys(invalidValues).forEach(property => {
    invalidValues[property].forEach(value => invalid.push([property + ' value ' + JSON.stringify(value), JSON.stringify(atPath(property, value)), 'style.' + property]))
  })
  ;['', 'font', 'font.scale', 'color', 'border', 'margin'].forEach(branch => {
    ;['__proto__', 'constructor', 'prototype', 'toString'].forEach(key => {
      const payload = JSON.parse('{"' + key + '":{"stylePolluted":true}}')
      invalid.push([(branch || 'root') + ' unsafe key ' + key, JSON.stringify(branch ? atPath(branch, payload) : payload), 'Unsupported style property'])
    })
  })
  invalid.forEach(item => {
    test('rejects ' + item[0] + ' without touching output', () => assertRejected(styleFile(item[1]), item[2]))
  })

  test('finite overflow is rejected for every numeric field', () => {
    Object.keys(invalidValues).filter(property => property !== 'font.family' && property.indexOf('color.') !== 0).forEach(property => {
      const content = JSON.stringify(atPath(property, 'OVERFLOW')).replace('"OVERFLOW"', '1e309')
      assertRejected(styleFile(content), 'style.' + property)
    })
  })

  test('all permitted zero values and integer endpoints are preserved', () => {
    const value = {
      font: { size: 0.5, scale: { x: 0, y: 0 } },
      bold: 0,
      italic: -1,
      underline: 0,
      strikeout: -1,
      spacing: 0,
      angle: 0,
      border: { style: 1, outline: 0.5, shadow: 0.5 },
      alignment: 1,
      margin: { left: 0, right: 0, vertical: 0 },
      encoding: 0
    }
    const file = styleFile(JSON.stringify(value))
    const result = runCLI([input, `--style=${file}`])
    assert.strictEqual(result.status, 0, result.stderr)
    assert.deepStrictEqual(styleColumns(path.join(temp, 'input.ass')).slice(7), [
      '0', '-1', '0', '-1', '0', '0', '0', '0', '1', '0.5', '0.5', '1', '0', '0', '0', '0'
    ])
  })

  test('exactly 64 KiB is accepted and 64 KiB plus one is rejected', () => {
    const content = '{}' + new Array(64 * 1024 - 1).join(' ')
    assert.strictEqual(Buffer.byteLength(content), 64 * 1024)
    const file = styleFile(content)
    const result = runCLI([input, `--style=${file}`])
    assert.strictEqual(result.status, 0, result.stderr)
    assert.strictEqual(fs.readFileSync(path.join(temp, 'input.ass'), 'utf8'), baseline)
    assertRejected(styleFile(content + ' '), '64 KiB')
    assertRejected(styleFile(JSON.stringify({ font: { family: new Array(40000).join('é') } })), '64 KiB')
  })

  const fakeLoader = (overrides) => {
    const closed = []
    const requested = []
    const fake = {
      constants: fs.constants,
      openSync: () => 42,
      fstatSync: () => ({ isFile: () => true, size: 0 }),
      readSync: (fd, buffer, offset, length) => {
        requested.push({ offset, length, allocation: buffer.length })
        buffer.fill(32, offset, offset + length)
        return length
      },
      closeSync: fd => closed.push(fd)
    }
    Object.keys(overrides || {}).forEach(key => { fake[key] = overrides[key] })
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'style.js'), 'utf8'), {
      require: name => { assert.strictEqual(name, 'fs'); return fake },
      module,
      Buffer
    })
    return { load: module.exports, closed, requested }
  }

  test('style reads are bounded even when a file grows beyond its stat size', () => {
    const loader = fakeLoader()
    assert.throws(() => loader.load('growing.json'), /64 KiB/)
    assert.deepStrictEqual(loader.requested, [{ offset: 0, length: 65537, allocation: 65537 }])
    assert.deepStrictEqual(loader.closed, [42])
  })

  test('style reads handle short reads without exceeding the cap', () => {
    let bytes = 0
    const loader = fakeLoader({ readSync: (fd, buffer, offset, length) => {
      const read = Math.min(length, 101)
      assert.strictEqual(offset, bytes)
      assert.strictEqual(offset + length, 65537)
      buffer.fill(32, offset, offset + read)
      bytes += read
      return read
    } })
    assert.throws(() => loader.load('short-reads.json'), /64 KiB/)
    assert.strictEqual(bytes, 65537)
    assert.deepStrictEqual(loader.closed, [42])
  })

  test('opened style file descriptors close on stat, non-regular, read and JSON failures', () => {
    const scenarios = [
      { fstatSync: () => { throw new Error('stat failed') } },
      { fstatSync: () => ({ isFile: () => false }) },
      { readSync: () => { throw new Error('read failed') } },
      { readSync: () => 0 }
    ]
    scenarios.forEach(overrides => {
      const loader = fakeLoader(overrides)
      assert.throws(() => loader.load('failure.json'))
      assert.deepStrictEqual(loader.closed, [42])
    })
    const unopened = fakeLoader({ openSync: () => { throw new Error('open failed') } })
    assert.throws(() => unopened.load('missing.json'), /open failed/)
    assert.deepStrictEqual(unopened.closed, [])
  })
} finally {
  fs.readdirSync(temp).forEach(file => fs.unlinkSync(path.join(temp, file)))
  fs.rmdirSync(temp)
}

console.log(`${tests - failures}/${tests} tests passed`)
if (failures) process.exitCode = 1
