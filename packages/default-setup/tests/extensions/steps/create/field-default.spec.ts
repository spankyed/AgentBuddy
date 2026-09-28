// What the editors' fallback box stores, which is the one piece of those forms with rules of its own.
//
// The rules exist because the runtime asks `default !== undefined`: a box left empty has to leave the key off
// rather than store `''`, or every mapping would always have a fallback. And what is typed reads the way a
// literal source reads — JSON when it parses — so `0` and `false` are not the strings "0" and "false".
import { describe, expect, it } from 'vitest'
import { parsedDefault, withDefault, writtenDefault } from '#extensions/steps/create/field-default.ts'

describe('writtenDefault', () => {
  it('shows a stored string as itself, so text does not come back quoted', () => {
    expect(writtenDefault('general')).toBe('general')
  })

  it.each([
    [0, '0'],
    [false, 'false'],
    [null, 'null'],
    [{ a: 1 }, '{"a":1}'],
    [[1, 2], '[1,2]'],
  ])('shows %s as %s', (stored, shown) => {
    expect(writtenDefault(stored)).toBe(shown)
  })

  it('shows no fallback as an empty box', () => {
    expect(writtenDefault(undefined)).toBe('')
  })
})

describe('parsedDefault', () => {
  it.each([
    ['0', 0],
    ['false', false],
    ['null', null],
    ['{"a":1}', { a: 1 }],
    ['[1,2]', [1, 2]],
  ])('reads %s as JSON', (typed, value) => {
    expect(parsedDefault(typed)).toEqual(value)
  })

  it.each(['general', 'not json {', '$.event.data.x'])('keeps %s as text when it is not JSON', (typed) => {
    expect(parsedDefault(typed)).toBe(typed)
  })

  it('reads an empty box as no fallback', () => {
    expect(parsedDefault('')).toBeUndefined()
  })
})

describe('withDefault', () => {
  it('sets the fallback on the mapping', () => {
    expect(withDefault({ target: 'threadId', source: '$.x' }, 'general'))
      .toEqual({ target: 'threadId', source: '$.x', default: 'general' })
  })

  // The case the runtime's `default !== undefined` depends on: the key goes, rather than being set to `''`
  it('removes the key when the box is emptied, rather than storing an empty string', () => {
    const cleared = withDefault({ target: 'threadId', source: '$.x', default: 'general' }, '')

    expect(cleared).toEqual({ target: 'threadId', source: '$.x' })
    expect('default' in cleared).toBe(false)
  })

  it('leaves the rest of the mapping alone', () => {
    expect(withDefault({ target: 'a', source: '$.x', default: 1 }, '2'))
      .toEqual({ target: 'a', source: '$.x', default: 2 })
  })
})
