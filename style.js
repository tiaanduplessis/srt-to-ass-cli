const fs = require('fs')

const maxBytes = 64 * 1024
const finite = value => typeof value === 'number' && isFinite(value)
const nonnegative = value => finite(value) && value >= 0
const integer = value => finite(value) && Math.floor(value) === value
const toggle = [value => value === 0 || value === -1, '0 or -1']
const color = [value => typeof value === 'string' && value.length === 10 && /^&H[0-9A-Fa-f]{8}$/.test(value), 'an ASS color in &HAABBGGRR format']
const margin = [value => integer(value) && value >= 0, 'a nonnegative integer']
const schema = {
  font: {
    family: [value => typeof value === 'string' && value.trim().length > 0 && !/[,\x00-\x1f\x7f]/.test(value), 'a nonblank font name without commas or control characters'], // eslint-disable-line no-control-regex
    size: [value => finite(value) && value > 0, 'a finite number greater than zero'],
    scale: {
      x: [nonnegative, 'a finite nonnegative number'],
      y: [nonnegative, 'a finite nonnegative number']
    }
  },
  color: { primary: color, secondary: color, outline: color, background: color },
  bold: toggle,
  italic: toggle,
  underline: toggle,
  strikeout: toggle,
  spacing: [finite, 'a finite number'],
  angle: [finite, 'a finite number'],
  border: {
    style: [value => value === 1 || value === 3, '1 or 3'],
    outline: [nonnegative, 'a finite nonnegative number'],
    shadow: [nonnegative, 'a finite nonnegative number']
  },
  alignment: [value => integer(value) && value >= 1 && value <= 9, 'an integer from 1 to 9'],
  margin: { left: margin, right: margin, vertical: margin },
  encoding: [value => integer(value) && value >= 0 && value <= 255, 'an integer from 0 to 255']
}

function validate (value, fields, property) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${property} must be a JSON object`)
  }
  const result = {}
  Object.keys(value).forEach(key => {
    const name = `${property}.${key}`
    if (key === '__proto__' || key === 'constructor' || key === 'prototype' || !Object.prototype.hasOwnProperty.call(fields, key)) {
      throw new Error(`Unsupported style property: ${name}`)
    }
    const field = fields[key]
    if (Array.isArray(field)) {
      if (!field[0](value[key])) throw new Error(`${name} must be ${field[1]}`)
      result[key] = value[key]
    } else {
      result[key] = validate(value[key], field, name)
    }
  })
  return result
}

module.exports = function loadStyle (filename) {
  if (typeof filename !== 'string' || !filename.trim()) {
    throw new Error('--style requires a JSON file path')
  }
  let fd
  let content
  try {
    // Nonblocking open also prevents a FIFO from hanging before the regular-file check.
    fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
    if (!fs.fstatSync(fd).isFile()) throw new Error('must be a regular file')
    const buffer = Buffer.alloc(maxBytes + 1)
    let length = 0
    while (length < buffer.length) {
      const read = fs.readSync(fd, buffer, length, buffer.length - length, null)
      if (read === 0) break
      length += read
    }
    if (length > maxBytes) throw new Error('must be no larger than 64 KiB')
    content = buffer.toString('utf8', 0, length)
  } catch (error) {
    throw new Error(`Cannot read style file "${filename}": ${error.message}`)
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
  let style
  try {
    style = JSON.parse(content)
  } catch (error) {
    throw new Error(`Invalid JSON in style file "${filename}": ${error.message}`)
  }
  return validate(style, schema, 'style')
}
