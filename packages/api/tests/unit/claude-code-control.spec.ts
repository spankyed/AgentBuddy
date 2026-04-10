/**
 * Tests for the control-request router.
 *
 * Covers:
 *   - `can_use_tool` dispatch + default-deny
 *   - generic `onControlRequest` fallback for unknown subtypes
 *   - dedupe of repeated request_ids
 *   - thrown handler errors become `{subtype:'error'}` responses
 *   - `BoundedSet` LRU eviction
 */

import { createControlRouter, BoundedSet } from '@/services/claude-code/control'
import type { ControlRequestLine } from '@/services/claude-code/types'

function makeRequest(requestId: string, subtype: string, extra: Record<string, unknown> = {}): ControlRequestLine {
  return {
    type: 'control_request',
    request_id: requestId,
    request: { subtype, ...extra },
  } as ControlRequestLine
}

interface SuccessResponse {
  type: 'control_response'
  response: { subtype: 'success'; request_id: string; response: unknown }
}
interface ErrorResponse {
  type: 'control_response'
  response: { subtype: 'error'; request_id: string; error: string }
}

function isSuccess(r: unknown): r is SuccessResponse {
  return !!r && typeof r === 'object' && (r as any).response?.subtype === 'success'
}
function isError(r: unknown): r is ErrorResponse {
  return !!r && typeof r === 'object' && (r as any).response?.subtype === 'error'
}

describe('createControlRouter', () => {
  describe('can_use_tool', () => {
    it('forwards to onPermissionRequest and wraps the decision as success', async () => {
      const calls: any[] = []
      const router = createControlRouter({
        onPermissionRequest: async (req) => {
          calls.push(req)
          return { behavior: 'allow' }
        },
      })

      const line = makeRequest('r1', 'can_use_tool', {
        tool_name: 'Bash',
        input: { command: 'ls' },
        tool_use_id: 'tu1',
      })
      const response = await router.handle(line)

      expect(calls).toHaveLength(1)
      expect(calls[0].tool_name).toBe('Bash')
      expect(isSuccess(response)).toBe(true)
      if (isSuccess(response)) {
        expect(response.response.request_id).toBe('r1')
        expect(response.response.response).toEqual({ behavior: 'allow' })
      }
    })

    it('defaults to deny when no permission handler is configured', async () => {
      const router = createControlRouter({})
      const response = await router.handle(makeRequest('r1', 'can_use_tool', {
        tool_name: 'Bash', input: {}, tool_use_id: 'tu1',
      }))
      expect(isSuccess(response)).toBe(true)
      if (isSuccess(response)) {
        expect((response.response.response as any).behavior).toBe('deny')
      }
    })
  })

  describe('unknown subtypes', () => {
    it('forwards to onControlRequest when provided', async () => {
      const router = createControlRouter({
        onControlRequest: async (req) => ({ echoed: req.subtype }),
      })
      const response = await router.handle(makeRequest('r1', 'hook_callback', { callback_id: 'h1' }))
      expect(isSuccess(response)).toBe(true)
      if (isSuccess(response)) {
        expect(response.response.response).toEqual({ echoed: 'hook_callback' })
      }
    })

    it('returns an error response when no hook is configured', async () => {
      const router = createControlRouter({})
      const response = await router.handle(makeRequest('r1', 'mcp_message'))
      expect(isError(response)).toBe(true)
      if (isError(response)) {
        expect(response.response.error).toContain('unhandled control_request subtype "mcp_message"')
      }
    })
  })

  describe('error recovery', () => {
    it('converts a thrown handler error into an error response', async () => {
      const router = createControlRouter({
        onPermissionRequest: () => { throw new Error('boom') },
      })
      const response = await router.handle(makeRequest('r1', 'can_use_tool', {
        tool_name: 'Bash', input: {}, tool_use_id: 'tu1',
      }))
      expect(isError(response)).toBe(true)
      if (isError(response)) {
        expect(response.response.error).toBe('boom')
      }
    })

    it('converts a non-Error throw into a stringified error response', async () => {
      const router = createControlRouter({
        onPermissionRequest: () => { throw 'string-error' as unknown as Error },
      })
      const response = await router.handle(makeRequest('r1', 'can_use_tool', {
        tool_name: 'Bash', input: {}, tool_use_id: 'tu1',
      }))
      expect(isError(response)).toBe(true)
      if (isError(response)) {
        expect(response.response.error).toBe('string-error')
      }
    })
  })

  describe('dedupe', () => {
    it('does not re-dispatch a handler for a repeated request_id', async () => {
      const handler = vi.fn(async () => ({ behavior: 'allow' }))
      const router = createControlRouter({ onPermissionRequest: handler })

      const line = makeRequest('same-id', 'can_use_tool', {
        tool_name: 'Bash', input: {}, tool_use_id: 'tu1',
      })

      const first = await router.handle(line)
      const second = await router.handle(line)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(isSuccess(first)).toBe(true)
      expect(isSuccess(second)).toBe(true)
      if (isSuccess(second)) {
        expect(second.response.request_id).toBe('same-id')
        expect(second.response.response).toEqual({})
      }
    })
  })
})

describe('BoundedSet', () => {
  it('reports has/add correctly', () => {
    const s = new BoundedSet(3)
    expect(s.has('a')).toBe(false)
    s.add('a')
    expect(s.has('a')).toBe(true)
    expect(s.size).toBe(1)
  })

  it('noops when adding an existing key', () => {
    const s = new BoundedSet(3)
    s.add('a')
    s.add('a')
    expect(s.size).toBe(1)
  })

  it('evicts oldest entries once the limit is exceeded', () => {
    const s = new BoundedSet(3)
    s.add('a')
    s.add('b')
    s.add('c')
    s.add('d') // evicts 'a'
    expect(s.has('a')).toBe(false)
    expect(s.has('b')).toBe(true)
    expect(s.has('c')).toBe(true)
    expect(s.has('d')).toBe(true)
    expect(s.size).toBe(3)
  })

  it('handles 501 unique inserts with limit 500 — only the oldest drops', () => {
    const s = new BoundedSet(500)
    for (let i = 0; i < 501; i++) s.add(`id-${i}`)
    expect(s.size).toBe(500)
    expect(s.has('id-0')).toBe(false)
    expect(s.has('id-1')).toBe(true)
    expect(s.has('id-500')).toBe(true)
  })
})
