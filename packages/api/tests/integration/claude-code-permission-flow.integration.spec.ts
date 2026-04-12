/**
 * Integration test — real Claude CLI subprocess + live permission flow.
 *
 * Unlike everything in `tests/unit/**`, this test spawns an actual `claude`
 * binary as a child process and drives it through the real stdio
 * permission protocol. It exists to answer one question that unit tests
 * with mocked streams cannot answer:
 *
 *   "Does the installed Claude CLI actually emit `can_use_tool`
 *    control_requests when stdin is kept open through the turn?"
 *
 * The wrapper chain (pump → router → handler → stream.write) is already
 * proven correct in isolation by 6 unit tests in `claude-code-query.spec.ts`
 * that mock `spawnStream`. Those tests can't tell us if the real CLI will
 * emit anything on a given argv + stdin lifecycle combination. This test
 * closes that loop by exercising the full stack against a real binary.
 *
 * Gating: requires `RUN_INTEGRATION=1` AND a resolvable `claude` CLI.
 * Skipped otherwise so default `npm test` runs stay fast and offline. Run
 * manually with:
 *
 *   cd packages/api && RUN_INTEGRATION=1 npm test -- claude-code-permission-flow
 *
 * Assumptions about the host environment when RUN_INTEGRATION=1:
 *   - `claude` on PATH (or CLAUDE_CLI_PATH env override via resolve-cli)
 *   - Valid `claude auth login` credentials in ~/.claude
 *   - Network connectivity
 *
 * If any of the above is missing, the test fails with a clear signal from
 * the wrapper's error classes — which is still useful, because a failure
 * with `ClaudeCliNotFoundError` is a different diagnosis than a failure
 * with `sawHandlerInvoked === false`.
 */

import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveForService } from '@/core/helpers/resolve-cli'
import { query } from '@/services/claude-code/query'
import type { PermissionHandler } from '@/services/claude-code/types'

/**
 * Precondition check. Runs at module load. If `claude` isn't resolvable or
 * the env var isn't set, we skip the whole describe — `describe.skipIf`
 * evaluates its argument eagerly, which is fine because resolveForService
 * is a quick filesystem lookup.
 */
const shouldRun = await (async () => {
  if (process.env.RUN_INTEGRATION !== '1') return false
  try {
    await resolveForService('claude-code')
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!shouldRun)('claude-code permission flow — real CLI subprocess', () => {
  it(
    'emits can_use_tool and invokes onPermissionRequest when stdin stays open through the turn',
    async () => {
      // Throwaway tmpdir. Any accidental edit from the CLI lands here and
      // nothing real is touched, even if the deny-after-prompt path races.
      const cwd = await mkdtemp(join(tmpdir(), 'claude-perm-test-'))
      const targetPath = join(cwd, 'target.txt')
      await writeFile(targetPath, 'original\n')

      let sawHandlerInvoked = false
      let seenToolName: string | null = null
      let seenInput: Record<string, unknown> | null = null

      const onPermissionRequest: PermissionHandler = async (req) => {
        sawHandlerInvoked = true
        seenToolName = req.tool_name
        seenInput = req.input
        // Deny so the turn ends quickly without actually mutating files.
        // The turn may either resolve (CLI gracefully handles deny and
        // narrates around it) or reject with ClaudeResultError — either
        // is acceptable. The test's assertion is on whether the handler
        // fired, not on the final outcome.
        return {
          behavior: 'deny',
          message: 'integration test — denying to short-circuit the turn',
        }
      }

      const handle = await query({
        prompt:
          'Please EDIT the file target.txt in the current working directory ' +
          'and change the word "original" to "replaced". Use the Edit tool.',
        cwd,
        permissionMode: 'default',
        // Edit is intentionally NOT in allowedTools — the CLI should emit
        // a can_use_tool control_request when it tries to call Edit.
        allowedTools: ['Read', 'Glob', 'Grep'],
        maxTurns: 3,
        onPermissionRequest,
      })

      // Drain the event stream. Any control_request lines are handled
      // internally and never surface here (see the leak regression test in
      // claude-code-query.spec.ts). We loop to completion so resultPromise
      // can settle and the deferred autoClose can fire.
      for await (const _ev of handle.events) {
        /* drain */
      }

      // Swallow any result-rejection — we're asserting on the permission
      // flow firing, not on the turn succeeding.
      await handle.result.catch(() => {})

      // ─── Assertions ─────────────────────────────────────────────────
      // The core signal: did the CLI emit `can_use_tool` and did it make
      // it through our wrapper chain to the handler? If this fails with
      // `sawHandlerInvoked === false`, the F1' fix didn't resolve the
      // upstream CLI behaviour, or the installed CLI version doesn't
      // support `--permission-prompt-tool stdio`, or the argv plumbing
      // regressed somewhere between args.ts and runner.ts. Check the
      // backend-console logs produced by F2 / F3 instrumentation to
      // narrow it down.
      expect(sawHandlerInvoked).toBe(true)

      // Sanity: whatever the CLI asked about should be a file-mutation
      // tool (Edit/Write/NotebookEdit), because the prompt explicitly
      // asks to EDIT target.txt.
      expect(seenToolName).not.toBeNull()
      expect(seenToolName).toMatch(/^(Edit|Write|NotebookEdit)$/)

      // And the input should reference our target file.
      expect(seenInput).not.toBeNull()
      const input = seenInput as unknown as Record<string, unknown>
      const inputPath = input?.file_path ?? input?.path
      expect(typeof inputPath).toBe('string')
      expect(inputPath as string).toContain('target.txt')
    },
  )

  it(
    'allow-and-execute: approves the tool and the CLI actually mutates the target file on disk',
    async () => {
      // This test exists because the existing "deny" test never exercised
      // the allow path — which was how the { updatedInput } missing-field
      // Zod bug slipped past every unit test and integration test for
      // an entire session. The unit-level regression guard in
      // `claude-code-permission-shape.spec.ts` now pins the shape
      // contract locally, but this test closes the gap end-to-end by
      // actually letting the real CLI process an approved Edit and
      // verifying the target file changed on disk.
      //
      // If this test fails with `sawHandlerInvoked === true` but the
      // file assertion fails, the wrapper is shaping the allow payload
      // wrong (the symptom the user hit in this session — everything
      // looked fine until the file never actually got written).
      const cwd = await mkdtemp(join(tmpdir(), 'claude-perm-allow-test-'))
      const targetPath = join(cwd, 'target.txt')
      const originalContent = 'original-content-do-not-match-this-anywhere-else\n'
      await writeFile(targetPath, originalContent)

      let sawHandlerInvoked = false
      let seenToolName: string | null = null

      const onPermissionRequest: PermissionHandler = async (req) => {
        sawHandlerInvoked = true
        seenToolName = req.tool_name
        // Echo req.input back as updatedInput — the CLI's
        // PermissionPromptToolResultSchema requires this field for
        // allow. Echoing the original input verbatim means the tool
        // runs exactly as Claude proposed it.
        return {
          behavior: 'allow',
          updatedInput: req.input,
        }
      }

      const handle = await query({
        prompt:
          `Please EDIT the file target.txt in the current working directory ` +
          `and change the EXACT string "${originalContent.trim()}" ` +
          `to "replaced-by-integration-test". Use the Edit tool. ` +
          `Do not read the file first; just call Edit directly.`,
        cwd,
        permissionMode: 'default',
        // Edit is not in allowedTools so it must go through
        // can_use_tool. Read is allowed so Claude can verify the
        // result without triggering another prompt loop.
        allowedTools: ['Read', 'Glob', 'Grep'],
        maxTurns: 5,
        onPermissionRequest,
      })

      for await (const _ev of handle.events) {
        /* drain */
      }
      await handle.result.catch(() => {})

      // ─── Assertions ─────────────────────────────────────────────────
      expect(sawHandlerInvoked).toBe(true)
      expect(seenToolName).toMatch(/^(Edit|Write|NotebookEdit)$/)

      // **The critical assertion**: the file on disk must have actually
      // changed. If the CLI rejected our control_response with a
      // ZodError, it would have treated the permission as a deny and
      // the file would still contain the original content — exactly
      // the regression this test guards against.
      const finalContent = await readFile(targetPath, 'utf-8')
      expect(finalContent).not.toBe(originalContent)
      expect(finalContent).toContain('replaced-by-integration-test')
    },
  )
})
