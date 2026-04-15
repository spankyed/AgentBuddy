/**
 * Parse the resolved payload of `awaitMessageResponse` for an approval
 * block into a typed decision. Single source of truth for the approval
 * shape contract between `ApprovalButtons.vue` / `InteractionContainer.vue`
 * on the frontend and `chat.ts` / any other action driving approvals on
 * the backend.
 *
 * Rationale: the response flows through a bunch of `any`-typed layers
 * (`MessageEntity.blockResponse: any`, brain event payload untyped,
 * `awaitMessageResponse` returns Promise<any>), so a shape mismatch
 * silently yields "every Allow click becomes Deny" with no compile
 * error — which is exactly what happened. Concentrating the check here
 * means the next person who needs to react to an approval only has to
 * read ONE file to get it right, and one test pins the contract.
 *
 * Canonical emission site:
 *   packages/renderer/src/plugins/threads/chat/interactions/InteractionContainer.vue:156-162
 *     handleApprove → handleBlockResponse({ approved: true,  reason })
 *     handleDeny    → handleBlockResponse({ approved: false, reason })
 *     handleCancel  → handleBlockResponse({ cancelled: true })
 *
 * Files without `export const meta` are auto-inlined into the consuming
 * action at compile time (see packages/default-setup/CLAUDE.md), so this
 * helper adds zero runtime dependencies.
 */

export interface ApprovalBlockResponse {
  approved: boolean;
  reason?: string;
}

export interface ApprovalDecision {
  allow: boolean;
  reason?: string;
}

/**
 * Narrow an untyped `awaitMessageResponse` payload to a typed approval
 * decision. Accepts `unknown` so callers can pass through raw
 * `await`-resolved values without casting.
 *
 * Defensively strict: anything that isn't exactly `{ approved: true }`
 * is treated as a deny. This mirrors the fail-safe default — if the
 * frontend shape ever drifts again, the user's experience degrades to
 * "my approval didn't stick" rather than "a denied tool silently ran".
 * In particular: `cancelled: true`, stringified booleans, legacy
 * `{ value: 'yes' }` shapes, and `null`/`undefined` all land in deny.
 */
export function parseApprovalDecision(response: unknown): ApprovalDecision {
  if (!response || typeof response !== 'object') {
    return { allow: false };
  }
  const r = response as Partial<ApprovalBlockResponse>;
  return {
    allow: r.approved === true,
    reason: typeof r.reason === 'string' ? r.reason : undefined,
  };
}
