import { describe, it, expect } from 'vitest'
import { InvalidArgumentError } from 'commander'
import { parseEntry, parseFormats, parsePort, parsePositiveInt, outputUrlSegment } from '../src/cli.js'

describe('parsePositiveInt', () => {
  it('accepts positive integers', () => {
    expect(parsePositiveInt('1')).toBe(1)
    expect(parsePositiveInt(' 1920 ')).toBe(1920)
  })

  it.each(['abc', '', '0', '-1', '1.5', '4e2', '0x10', '99999999999999999999'])(
    'rejects %j with an InvalidArgumentError',
    value => {
      expect(() => parsePositiveInt(value)).toThrow(InvalidArgumentError)
    },
  )
})

describe('parsePort', () => {
  it('accepts 1-65535', () => {
    expect(parsePort('4080')).toBe(4080)
    expect(parsePort('65535')).toBe(65535)
  })

  it.each(['0', '65536', 'http'])('rejects %j', value => {
    expect(() => parsePort(value)).toThrow(InvalidArgumentError)
  })
})

describe('parseFormats', () => {
  it('normalizes and de-duplicates formats', () => {
    expect(parseFormats('WebP, avif,webp')).toEqual(['webp', 'avif'])
  })

  it('rejects unknown formats', () => {
    expect(() => parseFormats('webp,gif')).toThrow(InvalidArgumentError)
  })
})

describe('parseEntry', () => {
  it('accepts safe segments and strips surrounding slashes', () => {
    expect(parseEntry('images')).toBe('images')
    expect(parseEntry('/static/img/')).toBe('static/img')
  })

  it.each(['', '/', 'a b', 'img/:id', 'img/*', '../x', 'a//b'])('rejects %j', value => {
    expect(() => parseEntry(value)).toThrow(InvalidArgumentError)
  })
})

describe('outputUrlSegment', () => {
  it('uses the last path component, not the whole path', () => {
    expect(outputUrlSegment('output')).toBe('output')
    expect(outputUrlSegment('public/images')).toBe('images')
    expect(outputUrlSegment('/var/out/')).toBe('out')
  })

  it('rejects names that are not URL-safe', () => {
    expect(() => outputUrlSegment('my output')).toThrow(/URL segment/)
    expect(() => outputUrlSegment('/')).toThrow(/URL segment/)
  })
})
