/**
 * ExitPlanMode input parsing — narrow the CLI-normalised SDK input for
 * the ExitPlanMode tool into the fields we actually surface in the UI.
 *
 * Shape (from leaked CLI source at
 *   packages/claude-code/src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts:77-108):
 *
 *   {
 *     plan?: string,                                  // injected from disk by normalizeToolInput
 *     planFilePath?: string,                          // injected from disk by normalizeToolInput
 *     allowedPrompts?: Array<{ tool: 'Bash', prompt: string }>
 *   }
 *
 * Defensively typed as `unknown` — our onPermissionRequest closure
 * receives an `any`-ish shape, and we want malformed payloads to
 * degrade gracefully rather than throw from inside the pump. If the
 * CLI ever extends the input shape (e.g. adds `planOutline`, etc.),
 * this helper is where the new field gets plumbed through.
 *
 * Files without `export const meta` are auto-inlined into the consuming
 * action at compile time (see packages/default-setup/CLAUDE.md), so this
 * helper adds zero runtime dependencies.
 */

export interface AllowedPrompt {
  tool: 'Bash';
  prompt: string;
}

export interface ParsedPlanInput {
  /** Plan body as markdown. Empty string if missing. */
  plan: string;
  /** Path the CLI saved the plan to, if provided. */
  planFilePath?: string;
  /** Semantic bash permissions the plan expects to exercise. */
  allowedPrompts: AllowedPrompt[];
}

/**
 * Narrow an untyped ExitPlanMode tool input into a typed `ParsedPlanInput`.
 * Accepts `unknown` so callers can pass the raw `req.input` without any
 * upfront casting. Never throws.
 */
export function parseExitPlanModeInput(input: unknown): ParsedPlanInput {
  if (!input || typeof input !== 'object') {
    return { plan: '', allowedPrompts: [] };
  }
  const i = input as Record<string, unknown>;
  const plan = typeof i.plan === 'string' ? i.plan : '';
  const planFilePath = typeof i.planFilePath === 'string' ? i.planFilePath : undefined;
  const allowedPrompts = Array.isArray(i.allowedPrompts)
    ? (i.allowedPrompts as unknown[]).filter((p): p is AllowedPrompt => {
        if (!p || typeof p !== 'object') return false;
        const rec = p as { tool?: unknown; prompt?: unknown };
        return rec.tool === 'Bash' && typeof rec.prompt === 'string';
      })
    : [];
  return { plan, planFilePath, allowedPrompts };
}

/**
 * Build a short preview of the plan for the approval block's `context`
 * field (which is a flat text string, not rich markdown — the full plan
 * lives in the plan artifact rendered in the right panel). This is just
 * enough to orient the user on the approval card itself.
 *
 * Rules:
 *  - Strip leading/trailing whitespace.
 *  - Take the first ~360 chars.
 *  - If truncated, append `…`.
 *  - Fall back to `(no plan content provided)` if empty after trim.
 *  - If allowedPrompts is non-empty, append a short "Requested permissions:"
 *    footer so the user knows what follow-up Bash access Claude wants.
 */
export function buildPlanApprovalContext(parsed: ParsedPlanInput): string {
  const trimmed = parsed.plan.trim();
  const max = 360;
  const preview = trimmed.length > max
    ? trimmed.slice(0, max - 1).trimEnd() + '…'
    : trimmed;
  const footer = parsed.allowedPrompts.length > 0
    ? `\n\nRequested permissions:\n${parsed.allowedPrompts.map(p => `• ${p.tool}: ${p.prompt}`).join('\n')}`
    : '';
  return (preview || '(no plan content provided)') + footer;
}
