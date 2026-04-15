/**
 * Parse a raw block-response into a step-specific value for the
 * onboarding flow's `handle-onboarding-response` action.
 *
 * Each onboarding step sends a different block type and expects a
 * different narrowed shape in return. This helper is the single source
 * of truth for the step → expected-shape contract.
 *
 * Shape contracts (verified end-to-end against the frontend at
 * packages/renderer/src/plugins/threads/chat/interactions/InteractionContainer.vue
 * and the block components at `./inputs/TextInput.vue`, `./inputs/ChoiceInput.vue`):
 *
 *   name       → sendTextInputBlock   → raw `string`
 *   tech-level → sendChoiceBlock      → raw `string` (choice id)
 *   projects   → sendTextInputBlock   → raw `string` (multiline)
 *   finish     → sendChoiceBlock      → raw `string` (ignored by handler)
 *
 * Cancel path: InteractionContainer's `handleCancel` emits
 * `{ cancelled: true }`. All steps degrade to "empty input" on this
 * path — the handler decides what "empty" means (default name, default
 * tech level, empty projects list, etc.) and can branch on the
 * `cancelled` flag if it ever needs to distinguish "user clicked
 * Cancel" from "user submitted an empty string".
 *
 * If a future step adds an approval block (emits `{ approved, reason }`),
 * extend `OnboardingStepId` and `ParsedStepResponse` below and add a
 * case here that delegates to `parseApprovalDecision` from the
 * claude-code _helpers.
 *
 * Files without `export const meta` are auto-inlined into the consuming
 * action at compile time (see packages/default-setup/CLAUDE.md).
 */

export type OnboardingStepId = 'name' | 'tech-level' | 'projects' | 'finish';

/**
 * Narrowed result per step. Each variant carries only the fields the
 * corresponding step handler actually needs, plus a `cancelled` flag so
 * handlers can distinguish "user clicked Cancel" from "user submitted
 * an empty string" if they ever need to.
 */
export type ParsedStepResponse =
  | { step: 'name'; name: string; cancelled: boolean }
  | { step: 'tech-level'; techLevel: string; cancelled: boolean }
  | { step: 'projects'; rawText: string; cancelled: boolean }
  | { step: 'finish'; cancelled: boolean };

/**
 * Narrow an untyped block-response to a step-specific parsed result.
 * Accepts `unknown` so callers can pass the raw
 * `awaitMessageResponse` / action-param `response` without upfront
 * casting. Never throws; malformed inputs degrade to the step's
 * "empty" default.
 */
export function parseStepResponse(
  step: OnboardingStepId,
  response: unknown,
): ParsedStepResponse {
  const cancelled =
    !!response
    && typeof response === 'object'
    && (response as { cancelled?: unknown }).cancelled === true;

  // After the cancelled check, treat an object response as "no useful
  // string payload" — frontend blocks for onboarding only emit raw
  // strings on the happy path, so anything object-shaped is either
  // {cancelled: true} or unexpected garbage we should degrade from.
  const raw = typeof response === 'string' ? response : '';

  switch (step) {
    case 'name':
      return { step: 'name', name: raw, cancelled };
    case 'tech-level':
      return { step: 'tech-level', techLevel: raw, cancelled };
    case 'projects':
      return { step: 'projects', rawText: raw, cancelled };
    case 'finish':
      return { step: 'finish', cancelled };
  }
}
