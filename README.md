
# srt-to-ass-cli
[![package version](https://img.shields.io/npm/v/srt-to-ass-cli.svg?style=flat-square)](https://npmjs.org/package/srt-to-ass-cli)
[![package downloads](https://img.shields.io/npm/dm/srt-to-ass-cli.svg?style=flat-square)](https://npmjs.org/package/srt-to-ass-cli)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
[![package license](https://img.shields.io/npm/l/srt-to-ass-cli.svg?style=flat-square)](https://npmjs.org/package/srt-to-ass-cli)
[![make a pull request](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

> Convert subtitles (SRT) to Advanced Substation Alpha (ASS)

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Custom style](#custom-style)
- [Maintainers](#maintainers)
- [Contribute](#contribute)
- [License](#License)

## Install

This project uses [node](https://nodejs.org) and [npm](https://www.npmjs.com). 

```sh
$ npm install -g srt-to-ass-cli
$ # OR
$ yarn global add srt-to-ass-cli
```

## Usage

```sh
$ srt-to-ass --input=sam.srt --output=foop.ass
$ # sam.srt has been converted to foop.ass!
$ srt-to-ass sam.srt
$ # sam.srt has been converted to sam.ass!
```

## Custom style

Pass a UTF-8 JSON file with `--style=style.json` or `--style style.json`:

```sh
$ srt-to-ass sam.srt --style=style.json
$ srt-to-ass --input=sam.srt --output=foop.ass --style "my style.json"
```

For example, `style.json` can contain:

```json
{
  "font": { "family": "Arial", "size": 48 },
  "color": { "primary": "&H0000FFFF" },
  "bold": -1,
  "border": { "outline": 0, "shadow": 0 },
  "margin": { "vertical": 20 }
}
```

The root JSON object is the style itself, without a `style` wrapper. Supplied
fields customize the existing `Default` style used by every subtitle. Omitted
fields keep the converter's defaults; `{}` is valid. Without `--style`, output
is unchanged. Style names and multiple styles are not supported.

The supported fields are:

| Field | Accepted value | Default |
| --- | --- | --- |
| `font.family` | Nonblank string without commas, ASCII control characters or DEL | `Freesans` |
| `font.size` | Finite number greater than zero | `64` |
| `font.scale.x`, `font.scale.y` | Finite nonnegative percentages | `100`, `100` |
| `color.primary` | ASS color string `&HAABBGGRR` | `&H00FFFFFF` |
| `color.secondary`, `color.outline`, `color.background` | ASS color strings `&HAABBGGRR` | `&H00000000` each |
| `bold`, `italic`, `underline`, `strikeout` | Number `-1` (on) or `0` (off), not a boolean | `0` each |
| `spacing`, `angle` | Finite numbers, including negative values | `0`, `0` |
| `border.style` | Number `1` (outline) or `3` (opaque box) | `1` |
| `border.outline`, `border.shadow` | Finite nonnegative numbers | `1`, `1` |
| `alignment` | Integer `1` through `9`, using numeric-keypad positions | `2` (bottom center) |
| `margin.left`, `margin.right`, `margin.vertical` | Nonnegative integers | `5`, `5`, `0` |
| `encoding` | Integer `0` through `255` for the legacy font character set | `0` |

Colors use exactly eight hexadecimal digits after uppercase `&H`: alpha, blue,
green, red. Alpha `00` is opaque and `FF` is transparent. Hexadecimal digits may
be uppercase or lowercase. See the [Aegisub style documentation](https://aegisub.org/docs/latest/styles/)
for style semantics, its [border style reference](https://aegisub.org/docs/latest/automation/lua/modules/karaskel.lua/),
and Microsoft's [font character-set reference](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-logfonta).

Files must be readable regular files no larger than 64 KiB (65,536 bytes).
Absolute paths, relative paths from the current working directory, and symlinks
to regular files are supported. Quote paths containing spaces. As with other
options, repeated `--style` flags use the last value. Inline JSON and JavaScript
configuration files are not supported.

Unknown properties (including `name`), wrong types, invalid values, malformed
JSON, and file errors are reported on stderr with exit code `1` before
conversion starts. These errors do not create or overwrite the output file.
Nested sections such as `font`, `font.scale`, `color`, `border`, and `margin`
must be JSON objects. Numeric strings are not converted to numbers.

## Contribute

1. Fork it and create your feature branch: git checkout -b my-new-feature
2. Commit your changes: git commit -am 'Add some feature'
3.Push to the branch: git push origin my-new-feature 
4. Submit a pull request

## License

MIT
