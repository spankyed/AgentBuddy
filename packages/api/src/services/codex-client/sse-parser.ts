/**
 * Lightweight SSE (Server-Sent Events) parser for Node.js fetch() ReadableStream.
 *
 * Ported from Codex's use of `eventsource_stream` crate. Parses the standard
 * SSE wire format: `data:`, `event:`, `id:` fields separated by double newlines.
 * Handles the `[DONE]` terminator used by OpenAI.
 */

export interface SseEvent {
  data: string
  event?: string
  id?: string
}

/**
 * Parse an SSE stream from a fetch Response body.
 * Yields SseEvent objects. Terminates on `[DONE]` or stream close.
 */
/**
 * Parse a single SSE event block into an SseEvent.
 * Returns 'done' if [DONE] terminator is encountered, null if no data.
 */
function parseEventBlock(part: string): SseEvent | 'done' | null {
  let data = ''
  let event: string | undefined
  let id: string | undefined

  for (const line of part.split('\n')) {
    if (line.startsWith('data: ')) {
      const val = line.slice(6)
      if (val === '[DONE]') return 'done'
      data += (data ? '\n' : '') + val
    } else if (line.startsWith('data:')) {
      const val = line.slice(5)
      if (val === '[DONE]') return 'done'
      data += (data ? '\n' : '') + val
    } else if (line.startsWith('event: ')) {
      event = line.slice(7)
    } else if (line.startsWith('event:')) {
      event = line.slice(6)
    } else if (line.startsWith('id: ')) {
      id = line.slice(4)
    } else if (line.startsWith('id:')) {
      id = line.slice(3)
    }
    // Lines starting with ':' are comments — ignore
  }

  if (!data) return null
  return { data, event, id }
}

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) break

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE events are separated by double newlines
      yield* drainBuffer()
    }

    // Flush any remaining bytes from the TextDecoder (incomplete multi-byte sequences)
    buffer += decoder.decode()

    // Process any remaining event in the buffer (stream may end without trailing \n\n)
    if (buffer.trim()) {
      yield* drainBuffer()
      // Handle case where final event has no trailing \n\n
      if (buffer.trim()) {
        const ev = parseEventBlock(buffer)
        if (ev && ev !== 'done') yield ev
      }
    }
  } finally {
    reader.releaseLock()
  }

  function* drainBuffer(): Generator<SseEvent> {
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      if (!part.trim()) continue
      const ev = parseEventBlock(part)
      if (ev === 'done') return
      if (ev) yield ev
    }
  }
}
