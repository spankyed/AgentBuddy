/**
 * NDJSON framing for the Claude Code stream-json protocol.
 *
 * The CLI writes one JSON value per line on stdout and expects the same on
 * stdin. Unicode line separators (U+2028, U+2029) are escaped to keep the
 * framing byte-safe even when JSON payloads contain them.
 *
 * Design notes:
 * - `decodeNdjson` is a pure async generator over a Readable — no buffering
 *   across call sites, no hidden state outside the generator frame.
 * - Parse errors on a single line are *emitted*, not thrown, so a malformed
 *   line never tears down the whole stream. Callers decide whether to log,
 *   surface, or abort.
 * - `encodeNdjsonLine` is the inverse: one value → one safely-encoded line.
 */

import type { Readable } from 'stream'

/** Result of parsing a single NDJSON line. */
export type DecodedLine =
  | { ok: true; value: unknown }
  | { ok: false; raw: string; error: Error }

/**
 * Split a Readable byte stream on `\n` and JSON.parse each non-empty line.
 *
 * Handles partial lines across chunks by carrying a buffer. Never throws —
 * malformed lines yield `{ok:false}` entries.
 */
export async function* decodeNdjson(stream: Readable): AsyncGenerator<DecodedLine> {
  let buffer = ''
  stream.setEncoding('utf8')

  for await (const chunk of stream as AsyncIterable<string>) {
    buffer += chunk
    let nl = buffer.indexOf('\n')
    while (nl !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, '')
      buffer = buffer.slice(nl + 1)
      if (line.length > 0) yield parseLine(line)
      nl = buffer.indexOf('\n')
    }
  }

  // Flush any trailing partial line the process produced before exiting.
  const tail = buffer.trim()
  if (tail.length > 0) yield parseLine(tail)
}

function parseLine(line: string): DecodedLine {
  try {
    return { ok: true, value: JSON.parse(line) }
  } catch (err) {
    return { ok: false, raw: line, error: err as Error }
  }
}

/**
 * Encode a value as a single NDJSON line with U+2028/U+2029 escaped.
 *
 * The CLI's own stream writer does the same (see
 * `src/cli/ndjsonSafeStringify.ts` in the leaked source). Without the
 * escape, a content string containing a line separator would be valid JSON
 * but break NDJSON framing for naive readers.
 */
export function encodeNdjsonLine(value: unknown): string {
  const json = JSON.stringify(value)
  const safe = json.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return safe + '\n'
}
