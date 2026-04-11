/**
 * Turn the brain's fire-and-forget `interactive.message.response` event into
 * a Promise scoped to a single messageId.
 *
 * Used by the Claude Code chat action to pause inside `onPermissionRequest`
 * until the user clicks Allow/Deny on an approval block — but it's
 * deliberately generic, so any action that sends a block and needs to wait
 * for the answer can reuse it.
 *
 * Files without `export const meta` are auto-inlined into the consuming
 * action at compile time (see packages/default-setup/CLAUDE.md), so this
 * helper adds zero runtime dependencies.
 */

import type { Services } from '../../../types';

export interface AwaitMessageResponseOptions {
  /** How long to wait before giving up. Default: 10 minutes. */
  timeoutMs?: number;
  /** Abort signal for cooperative cancellation. */
  signal?: AbortSignal;
}

/**
 * Wait for the user's response to a specific interactive block.
 *
 * Resolves with `event.payload.response` (shape depends on the block type
 * — `{ value, reason? }` for approval blocks, the raw choice id for choice
 * blocks, etc.). Rejects on timeout or abort.
 *
 * Cleans up the listener on every exit path, including thrown errors.
 */
export async function awaitMessageResponse(
  services: Services,
  messageId: string,
  opts: AwaitMessageResponseOptions = {},
): Promise<any> {
  // Default: 10 minutes. Approval blocks are user-driven — a 2-minute
  // timeout fires while users are still reading / thinking, which
  // silently denied and left Claude to generate prose fallback.
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const listenerId = `cc-await-${messageId}`;

  return await new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      services.brain.unlisten(listenerId);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('awaitMessageResponse: aborted'));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`awaitMessageResponse: timed out after ${timeoutMs}ms waiting on message ${messageId}`));
    }, timeoutMs);

    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    services.brain.listen(
      'interactive.message.response',
      (event: any) => {
        if (event?.payload?.messageId !== messageId) return;
        const response = event.payload.response;
        cleanup();
        resolve(response);
      },
      { id: listenerId },
    );
  });
}
