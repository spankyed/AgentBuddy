/**
 * Tests for NDJSON framing used by the Claude Code wrapper.
 *
 * `decodeNdjson` is an async generator — we exercise it with `Readable.from`
 * feeding synthetic chunks, including partial-line splits, and assert the
 * emitted `DecodedLine` objects. `encodeNdjsonLine` is checked for the
 * U+2028/U+2029 escape that keeps the framing byte-safe.
 */

import { Readable } from 'stream'
import { decodeNdjson, encodeNdjsonLine, type DecodedLine } from '@/services/claude-code/ndjson'

/** Build a Readable that emits each element as a separate chunk. */
function chunked(chunks: string[]): Readable {
  return Readable.from(chunks)
}

async function drain(stream: Readable): Promise<DecodedLine[]> {
  const out: DecodedLine[] = []
  for await (const line of decodeNdjson(stream)) out.push(line)
  return out
}

describe('decodeNdjson', () => {
  it('parses a single complete line', async () => {
    const out = await drain(chunked(['{"type":"user","text":"hi"}\n']))
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ ok: true, value: { type: 'user', text: 'hi' } })
  })

  it('yields two lines delivered in one chunk, in order', async () => {
    const input = '{"type":"a"}\n{"type":"b"}\n'
    const out = await drain(chunked([input]))
    expect(out.map(l => (l.ok ? (l.value as any).type : '?'))).toEqual(['a', 'b'])
  })

  it('buffers a line split across two chunks', async () => {
    const out = await drain(chunked(['{"type":"us', 'er","text":"hi"}\n']))
    expect(out).toHaveLength(1)
    expect((out[0] as any).value).toEqual({ type: 'user', text: 'hi' })
  })

  it('handles split at the newline boundary', async () => {
    const out = await drain(chunked(['{"type":"a"}', '\n{"type":"b"}\n']))
    expect(out.map(l => (l.ok ? (l.value as any).type : '?'))).toEqual(['a', 'b'])
  })

  it('skips empty lines', async () => {
    const out = await drain(chunked(['\n\n{"type":"a"}\n\n{"type":"b"}\n']))
    expect(out).toHaveLength(2)
  })

  it('flushes the trailing line without a final newline', async () => {
    const out = await drain(chunked(['{"type":"tail"}']))
    expect(out).toHaveLength(1)
    expect((out[0] as any).value).toEqual({ type: 'tail' })
  })

  it('emits a parse-error entry for malformed lines and keeps going', async () => {
    const out = await drain(chunked([
      '{"type":"a"}\n',
      'not json\n',
      '{"type":"b"}\n',
    ]))
    expect(out).toHaveLength(3)
    expect(out[0].ok).toBe(true)
    expect(out[1].ok).toBe(false)
    if (!out[1].ok) {
      expect(out[1].raw).toBe('not json')
      expect(out[1].error).toBeInstanceOf(Error)
    }
    expect(out[2].ok).toBe(true)
  })

  it('treats \\r\\n the same as \\n', async () => {
    const out = await drain(chunked(['{"type":"a"}\r\n{"type":"b"}\r\n']))
    expect(out.map(l => (l.ok ? (l.value as any).type : '?'))).toEqual(['a', 'b'])
  })
})

describe('encodeNdjsonLine', () => {
  it('appends a trailing newline', () => {
    const line = encodeNdjsonLine({ type: 'user' })
    expect(line.endsWith('\n')).toBe(true)
  })

  it('escapes U+2028 and U+2029 so NDJSON framing stays byte-safe', () => {
    // Payload contains a literal line separator that JSON.stringify would
    // leave intact — our encoder must escape it to \u2028 / \u2029.
    const payload = { text: 'a\u2028b\u2029c' }
    const out = encodeNdjsonLine(payload)
    expect(out).toContain('\\u2028')
    expect(out).toContain('\\u2029')
    expect(out).not.toContain('\u2028')
    expect(out).not.toContain('\u2029')
  })

  it('round-trips through decodeNdjson', async () => {
    const payload = { type: 'user', message: { role: 'user', content: 'hello' } }
    const line = encodeNdjsonLine(payload)
    const out = await drain(chunked([line]))
    expect(out).toHaveLength(1)
    expect((out[0] as any).value).toEqual(payload)
  })
})
