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
      const parts = buffer.split('\n\n')
      // Last part may be incomplete — keep it in the buffer
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        if (!part.trim()) continue

        let data = ''
        let event: string | undefined
        let id: string | undefined

        for (const line of part.split('\n')) {
          if (line.startsWith('data: ')) {
            const val = line.slice(6)
            // [DONE] is the OpenAI stream terminator
            if (val === '[DONE]') return
            data += (data ? '\n' : '') + val
          } else if (line.startsWith('data:')) {
            const val = line.slice(5)
            if (val === '[DONE]') return
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

        if (data) {
          yield { data, event, id }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
