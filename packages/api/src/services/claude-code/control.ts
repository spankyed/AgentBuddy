/**
 * The control-request router.
 *
 * During a streaming conversation the CLI intermittently asks the wrapper
 * to do things — check a tool permission, provide hook output, answer an
 * MCP elicitation — by emitting `{type:'control_request'}` NDJSON lines.
 * The wrapper must reply with a matching `{type:'control_response'}` line
 * or the CLI will stall.
 *
 * This module:
 *  - dispatches by `request.subtype` to the right user hook
 *  - supplies a sensible default for the `initialize` handshake so callers
 *    don't need to know what a valid initialize response looks like
 *  - deduplicates by `request_id` (the CLI may resend on reconnect)
 *  - never throws on a bad handler — errors become `subtype:'error'` control
 *    responses so the conversation keeps moving
 */

import type {
  CanUseToolRequest,
  ControlRequestHandler,
  ControlRequestLine,
  PermissionDecision,
  PermissionHandler,
} from './types'

export interface ControlRouter {
  /** Dispatch one control_request line. Returns the response value to send. */
  handle(line: ControlRequestLine): Promise<unknown>
}

export interface ControlRouterOptions {
  onPermissionRequest?: PermissionHandler
  onControlRequest?: ControlRequestHandler
}

/**
 * Build a control router that dispatches to caller hooks.
 *
 * Response format: returns the full `control_response` line-object ready to
 * be written via `StreamHandle.write`. Uses `{subtype:'success'}` on success
 * and `{subtype:'error', error}` on failure.
 */
export function createControlRouter(opts: ControlRouterOptions = {}): ControlRouter {
  const handled = new Set<string>()

  return {
    async handle(line: ControlRequestLine): Promise<unknown> {
      const requestId = line.request_id
      const subtype = line.request.subtype

      // Dedupe — the CLI will resend on reconnect and we must answer once.
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
  switch (subtype) {
    case 'can_use_tool': {
      const req = request as unknown as CanUseToolRequest
      const decision: PermissionDecision = opts.onPermissionRequest
        ? await opts.onPermissionRequest(req)
        : { behavior: 'deny', message: 'No permission handler configured' }
      return decision
    }

    case 'initialize': {
      // Minimal but valid handshake. Callers can override via onControlRequest
      // if they need to advertise custom commands/agents/models.
      if (opts.onControlRequest) {
        return await opts.onControlRequest(request as { subtype: string } & Record<string, unknown>)
      }
      return {
        commands: [],
        agents: [],
        output_style: 'default',
        available_output_styles: ['default'],
        models: [],
        account: {},
      }
    }

    case 'interrupt':
      // The CLI acknowledges interrupts via a result line — no payload needed.
      return {}

    default: {
      if (opts.onControlRequest) {
        return await opts.onControlRequest(request as { subtype: string } & Record<string, unknown>)
      }
      throw new Error(`unhandled control_request subtype "${subtype}"`)
    }
  }
}

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
