import { InvalidArgumentError } from 'commander'
import path from 'node:path'
import { CONVERTIBLE_FORMATS, isConvertibleFormat } from './srcset.js'

/** One URL path segment that is safe to embed verbatim in an Express route. */
const URL_SEGMENT = /^[A-Za-z0-9._~-]+$/

/**
 * Parses and validates the comma-separated --formats value (e.g. "webp,avif").
 * @param {string} value
 * @returns {import('./srcset.js').ConvertibleFormat[]}
 */
export function parseFormats(value) {
  const formats = value
    .split(',')
    .map(f => f.trim().toLowerCase())
    .filter(Boolean)

  const valid = formats.filter(isConvertibleFormat)
  const invalid = formats.filter(f => !isConvertibleFormat(f))
  if (invalid.length > 0) {
    throw new InvalidArgumentError(
      `invalid format(s): ${invalid.join(', ')}, allowed: ${CONVERTIBLE_FORMATS.join(', ')}`,
    )
  }

  return [...new Set(valid)]
}

/**
 * Parses a strictly positive decimal integer (e.g. --threads, --multiplier).
 * @param {string} value
 * @returns {number}
 */
export function parsePositiveInt(value) {
  const trimmed = value.trim()
  const n = Number(trimmed)
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(n) || n < 1) {
    throw new InvalidArgumentError(`expected a positive integer, got "${value}"`)
  }
  return n
}

/**
 * Parses a TCP port number (1-65535).
 * @param {string} value
 * @returns {number}
 */
export function parsePort(value) {
  const port = parsePositiveInt(value)
  if (port > 65535) {
    throw new InvalidArgumentError(`expected a port between 1 and 65535, got "${value}"`)
  }
  return port
}

/**
 * Parses the --entry URL prefix: one or more safe path segments separated by "/".
 * Leading and trailing slashes are ignored.
 * @param {string} value
 * @returns {string}
 */
export function parseEntry(value) {
  const entry = value.replace(/^\/+|\/+$/g, '')
  const segments = entry.split('/')
  if (entry === '' || !segments.every(s => URL_SEGMENT.test(s) && s !== '.' && s !== '..')) {
    throw new InvalidArgumentError(
      `expected URL path segments made of letters, digits, ".", "_", "~" or "-", got "${value}"`,
    )
  }
  return entry
}

/**
 * Derives the URL segment under which the output directory is served:
 * the last component of the output path (e.g. "public/images" → "images").
 * @param {string} outputDir
 * @returns {string}
 * @throws {Error} when the last path component is not URL-safe
 */
export function outputUrlSegment(outputDir) {
  const segment = path.basename(path.resolve(outputDir))
  if (!URL_SEGMENT.test(segment) || segment === '.' || segment === '..') {
    throw new Error(
      `output directory name "${segment}" cannot be used as a URL segment: ` +
        'use letters, digits, ".", "_", "~" or "-"',
    )
  }
  return segment
}
