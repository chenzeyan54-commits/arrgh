import { describe, expect, it } from 'vitest'
import { splitNdjson } from './api'

describe('splitNdjson', () => {
  it('parses every complete line in a chunk', () => {
    const { lines, rest } = splitNdjson('{"a":1}\n{"b":2}\n')
    expect(lines).toEqual([{ a: 1 }, { b: 2 }])
    expect(rest).toBe('')
  })

  it('holds a trailing partial line until the next chunk completes it', () => {
    const first = splitNdjson('{"a":1}\n{"b"')
    expect(first.lines).toEqual([{ a: 1 }])
    expect(first.rest).toBe('{"b"')
    const second = splitNdjson(first.rest + ':2}\n')
    expect(second.lines).toEqual([{ b: 2 }])
    expect(second.rest).toBe('')
  })

  it('ignores blank lines', () => {
    expect(splitNdjson('\n{"a":1}\n\n').lines).toEqual([{ a: 1 }])
  })
})
