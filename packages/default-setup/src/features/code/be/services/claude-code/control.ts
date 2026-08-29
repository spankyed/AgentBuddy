/**
 * The control-request router.
 *
 * During a streaming conversation the CLI emits `{type:'control_request'}`
 * NDJSON lines to ask the wrapper questions — "can I use this tool?", "run
 * this hook", "ask the user via MCP elicitation". The wrapper must reply
 * with a matching `{type:'control_response'}` or the CLI will stall.
 *
 * Direction matters: control_requests flow both ways, but this router only
 * handles the **CLI → client** half. Known subtypes in that direction (from
 * the leaked source — see `src/entrypoints/sdk/controlSchemas.ts`):
 *
 *   - `can_use_tool`     — permission check for a tool invocation
 *   - `hook_callback`    — stdin-driven hook output
 *   - `mcp_message`      — raw JSON-RPC to an SDK-provided MCP server
 *   - `elicitation`      — "ask the user" request from an MCP server
 *
 * Subtypes like `initialize`, `interrupt`, `set_permission_mode`, `set_model`
 * go the other direction (client → CLI) and are never received here — the
 * wrapper sends *those* via `QueryHandle.interrupt()` etc.
 *
 * Responsibilities:
 *   - `can_use_tool` → `onPermissionRequest` hook
 *   - everything else → `onControlRequest` hook (or a "no handler" error)
 *   - deduplicate by `request_id` with a bounded LRU (reconnect safety)
 *   - never let a handler throw crash the stream — thrown errors become
 *     `{subtype:'error'}` control_responses so the conversation continues
 */

import { createLogger } from '@/core/shared/debug/logger'
import type {
  CanUseToolRequest,
  ControlRequestHandler,
  ControlRequestLine,
  PermissionDecision,
  PermissionHandler,
} from './types'

const logger = createLogger('claude-code-control')

export interface ControlRouter {
  /** Dispatch one control_request line. Returns the response value to send. */
  handle(line: ControlRequestLine): Promise<unknown>
}

export interface ControlRouterOptions {
  onPermissionRequest?: PermissionHandler
  onControlRequest?: ControlRequestHandler
}

/** Max entries in the dedupe LRU. A single turn rarely tops a few dozen. */
const DEDUPE_LIMIT = 500

/**
 * Build a control router that dispatches to caller hooks.
 *
 * Response format: returns the full `control_response` line-object ready to
 * be written via `StreamHandle.write`. Uses `{subtype:'success'}` on success
 * and `{subtype:'error', error}` on failure.
 */
export function createControlRouter(opts: ControlRouterOptions = {}): ControlRouter {
  const handled = new BoundedSet(DEDUPE_LIMIT)

  return {
    async handle(line: ControlRequestLine): Promise<unknown> {
      const requestId = line.request_id
      const subtype = line.request.subtype

      // Dedupe — the CLI may resend on reconnect and we must answer once.
      if (handled.has(requestId)) {
        return success(requestId, {})
      }
      handled.add(requestId)

      try {
        const response = await dispatch(subtype, line.request, opts)
        return success(requestId, response)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return error(requestId, message)
      }
    },
  }
}

async function dispatch(
  subtype: string,
  request: ControlRequestLine['request'],
  opts: ControlRouterOptions,
): Promise<unknown> {
  if (subtype === 'can_use_tool') {
    const req = request as unknown as CanUseToolRequest
    if (!req.tool_name || !req.tool_use_id) {
      logger.warn('malformed can_use_tool request — missing tool_name or tool_use_id', { request })
      return { behavior: 'deny', message: 'Malformed request: missing tool_name or tool_use_id' }
    }
    logger.debug('dispatching can_use_tool', {
      tool_name: req.tool_name,
      tool_use_id: req.tool_use_id,
      hasHandler: !!opts.onPermissionRequest,
    })
    const decision: PermissionDecision = opts.onPermissionRequest
      ? await opts.onPermissionRequest(req)
      : { behavior: 'deny', message: 'No permission handler configured' }
    logger.debug('can_use_tool decision resolved', {
      tool_name: req.tool_name,
      behavior: decision.behavior,
    })
    return decision
  }

  // All other CLI → client subtypes (hook_callback, mcp_message, elicitation,
  // …) are forwarded to the generic hook so callers can extend without
  // patching this file.
  if (opts.onControlRequest) {
    logger.debug('dispatching generic control_request', { subtype })
    return await opts.onControlRequest(request as { subtype: string } & Record<string, unknown>)
  }
  logger.warn('unhandled control_request subtype', { subtype })
  throw new Error(`unhandled control_request subtype "${subtype}"`)
}

// ─── Bounded dedupe set ──────────────────────────────────────────────────────

/**
 * Minimal LRU-ish set. Insertion order is tracked in an array; when we exceed
 * the cap, the oldest entry is dropped. Good enough for de-duplicating
 * reconnected control_requests without growing unbounded across a long
 * conversation.
 *
 * Exported for tests.
 */
export class BoundedSet {
  private readonly order: string[] = []
  private readonly set = new Set<string>()
  constructor(private readonly limit: number) {}

  has(key: string): boolean {
    return this.set.has(key)
  }

  add(key: string): void {
    if (this.set.has(key)) return
    this.set.add(key)
    this.order.push(key)
    while (this.order.length > this.limit) {
      const evicted = this.order.shift()!
      this.set.delete(evicted)
    }
  }

  get size(): number {
    return this.set.size
  }
}

// ─── Response shaping ────────────────────────────────────────────────────────

function success(requestId: string, response: unknown): object {
  return {
    type: 'control_response',
    response: { subtype: 'success', request_id: requestId, response },
  }
}

function error(requestId: string, message: string): object {
  return {
    type: 'control_response',
    response: { subtype: 'error', request_id: requestId, error: message },
  }
}
