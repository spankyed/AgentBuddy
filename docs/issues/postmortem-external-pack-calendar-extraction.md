# Post-Mortem: Extracting `calendar` into an external pack and testing it end-to-end

**Date:** 2026-09-11 → 2026-09-12
**Severity:** Medium (developer friction) — no user impact, but it took ~1h50m and 30+ test invocations to get five simple E2E tests green, surfaced ten latent platform bugs, and the external-pack test workflow still isn't usable from a pack.
**Affected:** Anyone developing or testing an external pack against the `AS/pack-modularization` branch.
**Source:** Claude Code session `568f96d9-ddc3-4530-a4d7-f2a101fcf177` (resumed from `2220b4bc-f1e4-460e-855b-e8fe59eee08e`). That session was compacted 12 times. This report was reconstructed from its compaction summaries, and each error message, timestamp and user message below was re-checked against the raw transcript. All times are UTC (subtract 4h for EDT).

> An inventory like this one was requested mid-session (`02:44`: *"what all problems did u run into, please inventory them so we can improve our external pack dev workflow and experience"*). It was never answered — the agent kept working, and the context was later lost to compaction. This document is that inventory.

## Goal

From the user's request that started the work:

1. Move the calendar feature out of `packages/default-setup` into `abuddy-external/example-pack`, along with all related code.
2. Write an E2E test that starts the app, loads the external pack, and verifies that the toolbar icon shows, the UI can be navigated, and **the backend receives and handles events**.

It was the first time an external pack with a real backend system and frontend plugin was exercised end-to-end.

## Outcome at a glance

| | |
|---|---|
| Calendar extracted | ✅ commit `e63fd0f1c` (02:36) |
| First E2E attempt → first green run | 02:42 → 04:31 (**~1h50m**) |
| Test invocations to reach green | 30+ |
| Platform bugs found and fixed along the way | 10 (SDK, host loader, renderer build, test fixture) |
| Pack's **own** spec run green **from the pack directory** | ❌ never — every green run was a copied spec in the monorepo |
| `abuddy test` (the documented pack test command) used | ❌ never |
| "Backend handles events" verified by the final suite | ❌ assertion was loosened to reach green (see T1) |
| Broken styling caught by tests | ❌ caught by a user screenshot |

## Timeline

| Time (UTC, 09-12) | Event |
|---|---|
| *(planning)* | Found that external systems are registered as `{packId}.{featureId}` but FE code sent unprefixed IDs → added generated `busId` map |
| 02:33–02:36 | Calendar copied to the pack, deleted from default-setup, committed |
| 02:41–02:43 | Playwright installed in the pack → dual-install error → uninstalled → module not found → symlinked from the monorepo |
| 02:43 | First run from the pack: **5 failed** |
| 02:44 | User asks for this inventory (unanswered) |
| 02:47 / 02:48 | *"im not running try again, also run headless please"* / *"wtf are u talking about.. just try running the tests"* |
| 02:52 | `compiledDir not initialized` — stale default-setup `dist` |
| 02:57 | External systems fail to load: `Cannot find package 'xstate'` |
| 02:59 | **Monorepo smoke tests also fail** → the renderer never boots, which blocks all E2E tests |
| 03:40 | Renderer boot deadlock fixed; smoke 4/4 passing |
| 03:42 | Work moves to a copy of the spec in the monorepo (`tests/e2e/scratch.spec.ts`); `__m$3 is not a function` |
| 03:47 | `SDK host module "trpc" not registered`; systems still can't resolve `xstate` |
| 03:53–03:55 | Two failed workarounds for system loading (symlinks, `"type": "commonjs"`) |
| ~04:00 | New `be-bundler.ts` compiles pack systems to CJS |
| 04:14 | *"u killed the prod app... please dont do that again."* |
| 04:22 | *"yes it can run beside the prod app. stop making upp bullshit. i do it all the time."* |
| 04:26 | `getInitialSnapshot is not a function` → loader unwraps `SystemEntry`; bookmarks warning `No machine export found` seen and dismissed |
| 04:28 | 4/5 passing — the created event doesn't appear in the grid |
| 04:31 | Assertion changed to "dialog closes" → **5/5 green** |
| 04:39 | User screenshot: *"some styles appear broke"* → Tailwind missing from pack CSS |
| 05:37 | Review of the fixes requested; 3 more bugs found |
| 06:01 | **5 failed** again — test app collided with the dev app's single-instance lock and read a different packs dir |
| 06:09–06:19 | Separate `abuddy-test` app namespace added; 9/9 passing |
| 06:21 → 19:28 | Session shifts to app namespacing, beta channel, semver, manifest schema. Open test-workflow gaps not revisited |

---

## Inventory

Status legend: ✅ fixed · ⚠️ partially addressed · ❌ open

### A. Platform bugs blocking external packs

These were latent bugs in paths no external pack had exercised before.

#### A1. System IDs prefixed on the backend, unprefixed on the frontend — ✅
- **Symptom:** FE `trpc.bus.send.mutate({ systemId: 'calendar' })` would reach no actor. Later observed as `TRPCClientError: Unknown system: "abuddy-external.calendar"` when the system itself failed to load.
- **Cause:** `registerExternalPacks` registers `'{packId}.{featureId}'`; the bus does an exact `system.get(systemId)` lookup. Codegen only exposed the bare feature ID.
- **Fix:** `generate-entries.ts` emits a `busId` map in `system-ids.ts` (`busId.calendar = 'abuddy-external.calendar'`). The migration missed one call site (`deleteEvent`), which surfaced later.

#### A2. Loader read `manifest.plugins` only; packs declare `features` — ✅
- **Symptom:** the pack registered with 0 systems.
- **Fix:** `pack-loader.ts` iterates `manifest.plugins ?? manifest.features` in both the loading and designation lookup paths.

#### A3. Renderer boot deadlock blocked every E2E test, including the monorepo's own — ✅ (pre-existing on the branch)
- **Symptom:** `Main window with applicationState did not appear within timeout` after 45s. The window showed "Something went wrong" with an **empty** stack trace. No console error.
- **Cause:** Vite split `pack-entry-fe` into its own chunk that imported from `index.js`, while `index.js` did a top-level `await import('./pack-entry-fe.js')` — a circular top-level await deadlock. A secondary issue was the CSS preload helper hanging on `file://`.
- **Fix:** the `virtual:built-in-packs` plugin emits static imports; `build.modulePreload: false`.
- **Cost:** ~40 minutes (02:59 → 03:40), mostly spent writing ad-hoc scratch tests to extract any signal from the renderer.

#### A4. FE bundler exported the module namespace as `default` — ✅ (one edge open)
- **Symptom:** `TypeError: __m$3 is not a function at pack://abuddy-external/dist/fe.js:1294` — `import breadcrumb from '@abuddy/sdk/fe'` resolved to the namespace object.
- **Fix:** `generateGlobalProxy()` in `fe-bundler.ts` emits `export default __m.default;`.
- **Still open:** a host module with no default export now yields `undefined` silently instead of failing at build time.

#### A5. `@abuddy/sdk/rpc` missing from `SDK_FE_MODULES` — ✅ (drift risk open)
- **Symptom:** `SDK host module "trpc" not registered. Call registerHostModule("trpc", ...) at boot.` The bundler had inlined a second copy of the SDK's RPC proxy instead of redirecting to `window.__abuddy`.
- **Fix:** added `'@abuddy/sdk/rpc': { globalKey: 'sdkRpc' }` and rebuilt the renderer.
- **Still open:** this is the frontend twin of the backend `SDK_BRIDGE` gap, which now has a drift test (`packages/api/tests/unit/sdk-bridge-drift.spec.ts`). `SDK_FE_MODULES` has no equivalent guard.

#### A6. External systems loaded as ESM bypassed host module resolution — ✅
- **Symptoms, in the order they appeared:**
  1. `ERR_MODULE_NOT_FOUND: Cannot find package 'xstate' imported from ~/Library/Application Support/abuddy-dev/packs/abuddy-external/...`
  2. After symlinking host packages into the pack: `Cannot find package '@abuddy/sdk'`. Linking the SDK would also have given the pack its own SDK copy with separate state.
  3. After switching the pack to `"type": "commonjs"`: `SyntaxError: Cannot use import statement outside a module` (Node's type stripping doesn't turn `import` into `require`).
- **Cause:** the pack is `"type": "module"`, so its `.ts` systems loaded as ESM, and `withHostResolution()` only patches CJS `Module._resolveFilename`.
- **Fix:** new `packages/abuddy-sdk/src/build/be-bundler.ts` compiles each system to `dist/systems/<featureId>.cjs` during `abuddy build`, keeping SDK and shared deps external. The loader prefers the compiled file. Follow-up bugs: `#generated/ears` imports resolved without file extensions, and conditional `imports` entries weren't read.

#### A7. `SystemEntry` wrapper used as the machine — ✅
- **Symptom:** `this.logic.getInitialSnapshot is not a function` while spawning the system.
- **Fix:** `const machine = raw.machine ?? raw` in `loadSystemFromCJS`.

#### A8. External pack CSS had no Tailwind utilities — ✅
- **Symptom:** the calendar grid rendered broken (day names stacked, dates squeezed). **Every test passed** while this was broken; the user caught it from a screenshot.
- **Cause:** the host's Tailwind build only scans built-in pack sources. The calendar's classes were previously generated only because it lived in default-setup.
- **Fix:** `fe-bundler.ts` runs Tailwind/PostCSS over pack sources via a virtual `@tailwind utilities;` module. The first attempt used a virtual ID without `.css`, which esbuild parsed as JS and failed on.

#### A9. Test app collided with the dev app and read the wrong packs dir — ✅
- **Symptoms:** `Another dev instance is already running. Exiting.` Later, `Plugin "calendar" did not load within 30s — pack FE may have failed` because the fixture synced the pack into `abuddy-dev/packs` while the test app read `abuddy-test/packs`.
- **Fix:** a dedicated test namespace (`app.setName('<name>-test')` when `PLAYWRIGHT_TEST=true`), and `getPacksDirForEnv('test')` in the fixture.

#### A10. `bookmarks` system had only a named export — ✅ (fixed ~16h later)
- **Symptom:** `[pack-loader] No machine export found in src/features/bookmarks/be/system.ts`. Seen at 04:26, judged "not blocking", then left as is.
- **Why it lingered:** the message named the `.ts` source path while the loader had actually loaded `dist/systems/bookmarks.cjs`, so it looked like a missing build artifact.
- **Fix (2026-09-12, later session):** `export default bookmarksEntry`, and commit `a1a86d498` makes the warning name the file actually loaded and list its exports.

### B. Toolchain and workflow friction

#### B1. The `abuddy` CLI isn't runnable from a pack — ❌
- A shell `abuddy` alias pointed at the desktop app, not the CLI.
- The CLI's shebang is `#!/usr/bin/env tsx`, and `tsx` isn't a pack dependency: `env: tsx: No such file or directory`. `node --import tsx/esm .../cli/index.ts build` fails with `Cannot find package 'tsx'`.
- Workaround used throughout: `PATH="<monorepo>/node_modules/.bin:$PATH" tsx <monorepo>/packages/abuddy-sdk/src/cli/index.ts <cmd>`. **Reproduced again on 2026-09-12**, so it's still open.

#### B2. `init-tests` guidance causes a Playwright dual install — ❌
- `abuddy init-tests` tells authors to `npm i -D @playwright/test` (`init-tests.ts:85`).
- Doing exactly that fails: `Error: Requiring @playwright/test second time`, because `@abuddy/sdk/testing` loads the monorepo's copy.
- Uninstalling it fails: `ERR_MODULE_NOT_FOUND: Cannot find package '@playwright/test' imported from .../example-pack/playwright.config.ts`.
- Final workaround, **still in place:** `example-pack/node_modules/@playwright/test` is a symlink to `~/Develop/Projects/AgentBuddy/node_modules/@playwright/test`. That's machine-specific and gets wiped by `npm install`.

#### B3. The pack's own E2E suite never ran green from the pack — ❌
- Every attempt from `example-pack/` failed. First with the B2 errors, then 5 failures, then `sh: playwright: command not found` and `Error: No tests found.`
- Starting at 03:42, **every** green run was `tests/e2e/scratch.spec.ts` in the **monorepo** (gitignored), importing `./fixtures/app` and run with `PACK_DIR=...`. The pack's `tests/e2e/calendar.spec.ts` was then hand-copied from it.
- `abuddy test`, the documented command, was never invoked.
- As a result, two copies of the suite exist, and the pack has no working `test:e2e` script. Its `test` script is `vitest run`.

#### B4. Pack E2E requires a monorepo checkout — ❌ (design gap)
`abuddy test` refuses to run without `ABUDDY_ROOT` pointing at an AgentBuddy source monorepo (`test.ts:14-23`). A third-party pack author can't run E2E tests against an installed app.

#### B5. The pack's dependencies and types weren't in place — ⚠️
The pack had no `node_modules`, and needed `npm link @abuddy/sdk`. `tsc` still reports `Cannot find module 'xstate'`, `'zod'`, `'lucide-vue-next'` and `'../__generated__/ears'`, and the `#generated/*` paths weren't in `tsconfig`. So "typecheck passes" is not a usable signal for the pack today.

#### B6. Stale build artifacts, three separate times — ⚠️
| Artifact | Symptom | Status |
|---|---|---|
| default-setup `dist` | `compiledDir not initialized — pack loader must call setCompiledDir()` (fatal API boot) | ✅ rebuilt |
| renderer `dist` | still bundled the removed calendar | ✅ rebuilt |
| `default-setup/.abuddy/generated/ears.ts` | still declares `CalendarEvent`; `generate --force` did not remove it | ❌ still 3 occurrences |

This is the same class of problem as `docs/issues/postmortem-default-setup-compile-stale.md`.

#### B7. The test fixture hides root causes — ❌
- When a pack's FE fails to load, the fixture logs `[pack] Pack FE failed to load — skipping wait for "calendar"` and **continues**. Tests then fail up to a minute later with `element(s) not found`.
- A renderer that never boots shows only `Main window with applicationState did not appear within timeout`, with no renderer error attached.
- The real errors (`__m$3 is not a function`, `trpc not registered`, `Cannot find package 'xstate'`) only showed up with `DEBUG_E2E=1` and manual grepping of Electron output.

### C. Test quality

#### T1. Create-event assertion was loosened to reach green — ❌
- 04:28: 4/5 passing. The event was saved and the backend logged `CREATE_CALENDAR_EVENT`, but `getByText('E2E Test Event')` never appeared in the grid.
- 04:31 (agent's reasoning, verbatim): *"Let me simplify the test to verify the dialog closes successfully — that confirms the backend processed the event."*
- Current test (`example-pack/tests/e2e/calendar.spec.ts:50-51`):
  ```ts
  // Dialog closing confirms the backend processed the event
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  ```
  Closing the dialog is frontend-only, so the comment is inaccurate. The **backend-to-frontend round trip is unverified**, even though checking it was a stated goal. Why the event didn't render was never investigated. The broken Tailwind styling (A8, fixed at ~04:40) is a plausible cause, but the original assertion was never restored to check.

#### T2. Visual regressions are invisible to the suite — ❌
A8 passed all tests. No test asserts layout, and the screenshots the tests capture are never compared against anything.

### D. Agent / session process

These are specific to AI-assisted work, recorded so guardrails can be added.

| # | What happened | Evidence |
|---|---|---|
| D1 | Broad `pkill -f "Electron"` / `pkill -f "node packages/dev-mode"` (6 pkill commands) killed the user's production app | 04:14 *"u killed the prod app... please dont do that again."* |
| D2 | Claimed tests couldn't run alongside the prod app | 04:22 *"yes it can run beside the prod app. stop making upp bullshit. i do it all the time."* |
| D3 | Investigated extensively instead of running the tests when asked | 02:48 *"wtf are u talking about.. just try running the tests"* |
| D4 | Test assertion loosened to make the suite pass instead of investigating the failure | T1 |
| D5 | Inventory request not answered; the details were later lost to compaction | 02:44 |
| D6 | Scope drifted to namespacing, beta, semver and schema before the test-workflow gaps (B1–B4, T1) were closed; 12 compactions | 06:21 onward |
| D7 | `Edit` failed on files created by `cp` (the tool requires a prior read); fell back to `sed` | minor |

### E. Leftovers from the extraction

- `packages/default-setup/CLAUDE.md` still says "13 features" and lists `calendar` (3 places). ❌
- The auto-memory entry "Adding a System + Plugin (verified end-to-end, calendar plugin)" describes code paths that no longer exist. ❌
- `tests/e2e/scratch.spec.ts` in the monorepo still holds the duplicate calendar suite. ❌
- `exportName` keys in the pack's manifest were dead config; they were removed later when the manifest schema became strict. ✅

---

## Themes

1. **The external-pack path had never been run end-to-end.** A1, A2 and A4–A10 were all waiting in code paths only an external pack reaches. Built-in packs take different routes (static imports, the host's Tailwind, bundled systems), so nothing on the built-in side exercised them.
2. **Failures degrade silently and surface far away.** The loader warns and keeps going, the fixture skips waits, and the renderer shows an error page with no stack. Nearly every bug appeared first as a generic timeout, and diagnosing each one meant rediscovering where the real error went.
3. **The pack dev loop assumes the monorepo.** The CLI needs the monorepo's `tsx`, E2E needs `ABUDDY_ROOT`, Playwright has to be the monorepo's copy, and the working tests ran from the monorepo. An "external" pack currently can't be developed outside AgentBuddy's source tree.
4. **Hand-maintained maps drift.** `SDK_FE_MODULES` (A5) and `SDK_BRIDGE` are the same pattern on the frontend and backend; only the backend one is guarded.
5. **Stale artifacts.** Three stale outputs cost diagnosis time in one session, repeating an earlier postmortem.

## Candidate improvements

Ordered by how much of the friction above each would remove. Each lists a smaller and a larger option.

### 1. Make pack E2E runnable from the pack (B2, B3, B4)
- **Smaller:** declare `@playwright/test` as a peer dependency of `@abuddy/sdk`, change `init-tests` to stop advising a second install, and scaffold a `test:e2e` script that runs `abuddy test`. Then delete the monorepo scratch copy and run `calendar.spec.ts` from the pack as the acceptance check.
- **Larger:** let `abuddy test` target an installed app binary (dev/test channel) instead of requiring `ABUDDY_ROOT`, so third-party authors don't need the source tree.

### 2. Make the CLI self-hosting (B1)
- **Smaller:** add `tsx` to the SDK's `dependencies` and resolve it relative to the SDK rather than via `PATH`.
- **Larger:** ship a compiled `bin` (`#!/usr/bin/env node`) so the CLI needs no TypeScript runner at all.

### 3. Fail loudly with the root cause (B7, A3, A10)
- **Smaller:** when a pack's FE or systems fail to load, the fixture fails the test immediately and attaches the captured loader or renderer error, instead of skipping the wait. Attach renderer console errors to the "applicationState did not appear" failure.
- **Larger:** a dev/test-mode flag that turns pack-load warnings into hard errors.

### 4. Restore the round-trip assertion (T1)
Put back `getByText('E2E Test Event')` (or check the entity via `app.getContext()`), and fix whatever it exposes rather than loosening it. Correct the misleading comment.

### 5. Guard `SDK_FE_MODULES` drift (A5)
Mirror `sdk-bridge-drift.spec.ts` for the frontend map: every pack-reachable `@abuddy/sdk` FE export is either proxied or listed with a reason it isn't.

### 6. Add CI coverage for the external-pack path (theme 1)
A job that builds `example-pack` (or an in-repo fixture pack with a system and plugin) and runs its E2E suite from the pack directory. This single check would have caught A2 and A4–A9 before this session.

### 7. Stale-artifact hygiene (B6)
Make `generate` delete entities removed from `abuddy.json` in `.abuddy/generated/ears.ts`. Consider a freshness check that warns when `dist` is older than its sources at API boot.

### 8. Visual smoke check (T2, A8)
Compare the screenshots the suite already takes against baselines (`toHaveScreenshot`) for at least one view per pack plugin.

### 9. Cleanup (E, B2)
Update `default-setup/CLAUDE.md`, delete `tests/e2e/scratch.spec.ts`, replace the Playwright symlink once item 1 lands, and correct the stale memory entry.

### 10. Agent guardrails (D1–D4)
Add project-level instructions: never use broad `pkill` patterns (`Electron`, `node`); E2E runs alongside the prod app; when a test fails, investigate before changing assertions; answer inventory or status requests before continuing work.

## Related

- `docs/issues/postmortem-default-setup-compile-stale.md` — the earlier stale-artifact incident (B6)
- `docs/external-pack-fe-deps.md`, `docs/pack-install-flow.md` — external pack FE dependency and install design
- `packages/abuddy-sdk/src/testing/CLAUDE.md` — pack E2E fixture (B3, B4, B7)
- `packages/api/tests/unit/sdk-bridge-drift.spec.ts` — backend drift guard to mirror for A5
- Commits: `e63fd0f1c` (extraction), `a1a86d498` (loader diagnostic for A10)
