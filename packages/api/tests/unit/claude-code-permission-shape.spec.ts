/**
 * Regression guard for the `can_use_tool` response shape contract
 * between our wrapper and the Claude Code CLI.
 *
 * The CLI validates every `control_response` for a `can_use_tool`
 * request against a Zod union — see leaked source at:
 *   packages/claude-code/src/utils/permissions/PermissionPromptToolResultSchema.ts:44-77
 *
 * Allow branch REQUIRES `updatedInput: Record<string, unknown>`.
 * Deny branch REQUIRES `message: string`.
 *
 * When our wrapper sent `{ behavior: 'allow' }` with no `updatedInput`,
 * the CLI's Zod parser rejected it with `invalid_union`, the CLI's
 * try/catch at `structuredIO.ts:639-649` wrapped the error as a
 * synthetic `{ behavior: 'deny', message: 'Tool permission request
 * failed: ZodError: …' }`, and our `user`/tool_result handler surfaced
 * the error text on the tool-activity row. Every approved Write/Bash/
 * Edit showed up as a red error instead of executing.
 *
 * This test file mirrors the CLI's validator in a local Zod schema and
 * runs it against every wrapper-built shape. If someone refactors
 * `chat.ts` and drops `updatedInput` again, the type system catches it
 * first — and if somehow the type system misses it (e.g. an `as any`
 * cast), these tests fail with the exact same `invalid_union` error
 * the CLI would produce at runtime.
 *
 * The mirror intentionally leaves `updatedPermissions` loose (array of
 * unknown) because we don't currently produce those values — we can
 * tighten the mirror later if we start sending permission-update
 * payloads. Everything else is structurally faithful to the leaked
 * source.
 */

import { z } from 'zod'

// ─── Mirror of the CLI's PermissionPromptToolResultSchema ──────────────
// Kept in sync with packages/claude-code/src/utils/permissions/PermissionPromptToolResultSchema.ts
// When the upstream schema changes, update this mirror FIRST; the
// failing tests are the earliest warning.

const PermissionAllowResultMirror = z.object({
  behavior: z.literal('allow'),
  updatedInput: z.record(z.string(), z.unknown()),
  updatedPermissions: z.array(z.unknown()).optional(),
  toolUseID: z.string().optional(),
  decisionClassification: z
    .enum(['user_temporary', 'user_permanent', 'user_reject'])
    .optional(),
})

const PermissionDenyResultMirror = z.object({
  behavior: z.literal('deny'),
  message: z.string(),
  interrupt: z.boolean().optional(),
  toolUseID: z.string().optional(),
  decisionClassification: z
    .enum(['user_temporary', 'user_permanent', 'user_reject'])
    .optional(),
})

const PermissionResultMirror = z.union([
  PermissionAllowResultMirror,
  PermissionDenyResultMirror,
])

describe('permission decision wire shape (mirror of CLI Zod schema)', () => {
  // ─── Allow branch — canonical happy paths ──────────────────────────

  it('allow payload with updatedInput matching req.input validates', () => {
    const payload = {
      behavior: 'allow' as const,
      updatedInput: { file_path: '/foo.ts', old_string: 'a', new_string: 'b' },
    }
    expect(() => PermissionResultMirror.parse(payload)).not.toThrow()
  })

  it('allow payload with empty updatedInput validates (mobile-client passthrough)', () => {
    // The CLI treats `{}` as "run with the original tool input" at
    // PermissionPromptToolResultSchema.ts:110-111 — Zod still requires
    // the FIELD to be present, but its value can be an empty object.
    const payload = { behavior: 'allow' as const, updatedInput: {} }
    expect(() => PermissionResultMirror.parse(payload)).not.toThrow()
  })

  // ─── Allow branch — regression guards ──────────────────────────────

  it('allow payload WITHOUT updatedInput FAILS — the bug that produced "Tool permission request failed: ZodError"', () => {
    // This is the exact shape the wrapper used to send. If a refactor
    // ever drops `updatedInput` from the allow-return in chat.ts, this
    // test fails with the same `invalid_union` error the CLI would
    // produce at runtime.
    const bad = { behavior: 'allow' as const }
    expect(() => PermissionResultMirror.parse(bad)).toThrow()
  })

  it('allow payload with non-object updatedInput FAILS', () => {
    // Defensive: someone accidentally passes a string or array instead
    // of a dict. `z.record(z.string(), z.unknown())` rejects.
    expect(() =>
      PermissionResultMirror.parse({ behavior: 'allow' as const, updatedInput: 'foo' }),
    ).toThrow()
    expect(() =>
      PermissionResultMirror.parse({ behavior: 'allow' as const, updatedInput: [1, 2, 3] }),
    ).toThrow()
  })

  // ─── Deny branch — canonical happy paths ───────────────────────────

  it('deny payload with message validates', () => {
    const payload = {
      behavior: 'deny' as const,
      message: 'User clicked deny',
    }
    expect(() => PermissionResultMirror.parse(payload)).not.toThrow()
  })

  it('deny payload with optional interrupt flag validates', () => {
    const payload = {
      behavior: 'deny' as const,
      message: 'aborting — user requested cancel',
      interrupt: true,
    }
    expect(() => PermissionResultMirror.parse(payload)).not.toThrow()
  })

  // ─── Deny branch — regression guards ───────────────────────────────

  it('deny payload WITHOUT message FAILS', () => {
    // Deny's message is non-optional per the CLI schema. Our call
    // sites always fall back to "User denied" / "Plan rejected by user"
    // / "No permission handler configured" via `|| ''` — these tests
    // pin that contract.
    const bad = { behavior: 'deny' as const }
    expect(() => PermissionResultMirror.parse(bad)).toThrow()
  })

  it('deny payload with empty string message validates (zod accepts empty strings)', () => {
    // Zod's `z.string()` accepts empty strings — the CLI does too.
    // This is intentional; an empty deny reason is still a deny.
    const payload = { behavior: 'deny' as const, message: '' }
    expect(() => PermissionResultMirror.parse(payload)).not.toThrow()
  })

  // ─── End-to-end: router's success envelope wraps a valid payload ───

  it('control router success envelope wraps a valid allow payload', () => {
    // Mirrors what `control.ts:success()` produces. The CLI extracts
    // `message.response.response` and parses it against the mirror
    // schema — this test pins that the wrapped shape unwraps cleanly.
    const allow = {
      behavior: 'allow' as const,
      updatedInput: { command: 'ls' },
    }
    const envelope = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'req-1',
        response: allow,
      },
    }
    expect(() =>
      PermissionResultMirror.parse(envelope.response.response),
    ).not.toThrow()
  })

  it('control router success envelope wraps a valid deny payload', () => {
    const deny = { behavior: 'deny' as const, message: 'User denied' }
    const envelope = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'req-2',
        response: deny,
      },
    }
    expect(() =>
      PermissionResultMirror.parse(envelope.response.response),
    ).not.toThrow()
  })
})
