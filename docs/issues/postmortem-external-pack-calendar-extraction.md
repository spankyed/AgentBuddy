# Post-Mortem: Extracting `calendar` into an external pack and testing it end-to-end

**Date of incident:** 2026-09-11 → 2026-09-12
**Status re-verified:** 2026-09-12 against `master@898134763`, by running the checks listed under each item — including the pack's E2E suite from the pack directory.
**Actionable items worked:** 2026-09-12 on `master@394b55317` (uncommitted); see *Status of the actionable items*.
**Severity:** Medium (developer friction, plus one live functional bug) — no end-user impact.
**Affected:** Anyone developing or testing an external pack.
**Source:** Claude Code session `568f96d9-ddc3-4530-a4d7-f2a101fcf177` (resumed from `2220b4bc-f1e4-460e-855b-e8fe59eee08e`), compacted 12 times. This report was reconstructed from its compaction summaries, with every error message and quote re-checked against the raw transcript.

> An inventory like this one was requested mid-session (*"what all problems did u run into, please inventory them so we can improve our external pack dev workflow and experience"*) but never answered, and the context was later lost to compaction.

## Summary

Moving `calendar` from `packages/default-setup` into `abuddy-external/example-pack` was the first end-to-end run of an external pack with a real backend system and frontend plugin. Getting five simple E2E tests to pass took ~1h50m and 30+ test runs. Along the way it surfaced **ten latent platform bugs**, all of which are now fixed and still in place.

What remains after the 2026-09-12 pass:

- The suspected "live bug" (item 1) wasn't a platform bug. Test data accumulating across runs plus the month grid's chip cap hid the event; the round trip works. The test now asserts it for real.
- **Waiting on decisions:** the CLI's `tsx` dependency (item 2), the pack E2E dependency on the monorepo (item 3), and five new findings (N1–N5), led by N1: a freshly scaffolded pack can't build.
- Guards, CI coverage, typecheck, baselines, cleanup and guardrails (items 4–10) are done.

---

## Status of the actionable items (worked 2026-09-12)

| # | Item | Status |
|---|---|---|
| 1 | Calendar create round-trip | ✅ Resolved: not a platform bug; the test is fixed and the assertion restored |
| 2 | CLI needs `tsx` on `PATH` | ⏸ Open, needs a decision |
| 3 | Pack E2E depends on the monorepo | ⏸ Open, needs a decision |
| 4 | Fixture hides root causes | ✅ Resolved |
| 5 | Silent inlining of unproxied SDK FE imports | ✅ Resolved (build now fails) |
| 6 | No CI coverage for external packs | ✅ Resolved locally; the CI job hasn't run on a runner yet |
| 7 | Pack typecheck | ✅ Template and codegen fixed; the example pack's remaining errors belong to item 3 |
| 8 | No visual baselines | ✅ Resolved |
| 9 | Cleanup | ✅ Resolved |
| 10 | Agent guardrails | ✅ Resolved |
| N1–N5 | New findings from this pass | ⏸ Open (see below) |

Verification for the whole pass:
- `npm run typecheck`: all 4 legs pass.
- Unit tests: sdk 106, api 102, default-setup 527 passed (2 skipped).
- `schema:check` and `api:check` pass.
- Example pack `abuddy test`: 7 passed.
- `npm run test:external-pack`: 2 passed.
- Monorepo smoke E2E: 4 passed.

### 1. Calendar create round-trip — ✅ resolved, not a platform bug

**Root cause:** none of the three hypotheses. Temporary probes showed:
- Backend: the handler ran, `calendarCommands.create` persisted (`shortCode: CAL-12`), and `CALENDAR_EVENT_CREATED` was emitted to plugin `calendar`.
- Frontend: the calendar actor's `context.events` went from 12 to 13 with the new title.

The event didn't render because of two things together:
- **The `abuddy-test` data dir persists across runs.** Each run added another event on today's date.
- **`MonthGrid` caps chips by cell height.** In the test window a month cell is 53px tall, so it fits one chip row. Two or more events collapse into "N more events…" and show zero chips. The cell read "13 more events…".

**Fix** (`example-pack/tests/e2e/calendar.spec.ts`): the test is renamed to *create and delete event via UI round-trip*.
- It creates the event from today's day view, which lists every event.
- It asserts the unique title is visible, then deletes the event through the editor and asserts it's gone. That also cleans up and covers `CALENDAR_EVENT_DELETED`.
- It returns to month view via the breadcrumb.
- The misleading "dialog closing confirms…" comment is gone.

**Mutation check:** suppressing the backend's `CALENDAR_EVENT_CREATED` emit fails the test.

**Found while debugging:** the fixture synced an existing `dist/` without rebuilding, so the first probe ran a build from 05:31 (fixed under item 4).

**UX note (open, design):** at a one-chip capacity, a cell with two or more events shows no chips at all, only "N more". See N5.

### 2. The `abuddy` CLI can't run from a pack without a `PATH` workaround — ⏸ decision needed

Re-verified on HEAD with a clean `PATH`: `env: tsx: No such file or directory`.

| Option | Change | Trade-offs |
|---|---|---|
| A | Move `tsx` to SDK `dependencies`; have `bin` point at a small JS launcher that runs the CLI through the SDK's own `tsx` | Small diff. Packs still run TypeScript at CLI start, with tsx's startup cost. |
| B | Compile the CLI to JS during SDK build; `bin` gets a `#!/usr/bin/env node` shebang | No TS runner at runtime and faster startup. Adds an SDK build step and a `dist/` that has to stay in sync with `src/` for linked or dev use. |

### 3. Pack E2E still depends on the monorepo — ⏸ decision needed

Re-verified on HEAD: `abuddy test` requires `ABUDDY_ROOT`, and `@playwright/test` in the example pack is still a symlink into the monorepo.

This pass adds one more symptom of the linked-SDK setup. The SDK's `peerDependencies` (`xstate`, `vue`, `@xstate/vue`, `lucide-vue-next`, …) and its `zod` dependency don't get installed into a pack that uses `npm link`. As a result, all 35 remaining type errors in the example pack come from them. With those modules mapped to the monorepo's copies, the pack typechecks with **0 errors** (item 7).

| Option | Change | Trade-offs |
|---|---|---|
| A | `init-tests` scaffolds `test:e2e: abuddy test`, and the CLI detects a linked SDK and explains how to resolve Playwright and the host-shared deps instead of advising `npm i -D @playwright/test` | Small. Authors still need a monorepo checkout. |
| B | `abuddy test` launches an installed test-channel app build instead of requiring `ABUDDY_ROOT`, and packs install the SDK from a registry so peers install normally | Third-party authors don't need the source tree. Needs a distributable test channel and a published SDK. |

### 4. The test fixture hides root causes — ✅ resolved

Changes in `packages/abuddy-sdk/src/testing/index.ts`:
- **Always rebuilds the pack.** The old "build only if `dist/` is missing" rule silently tested stale code (see item 1).
- **Always buffers Electron stdout/stderr** (last 200 lines). Every fixture failure reports the renderer console errors plus the Electron/API error lines, without `DEBUG_E2E`.
- **Fails immediately when the pack under test's FE entry fails to load**, with the error attached, instead of logging "skipping wait". A pack plugin that never registers, "App did not reach connected state", and "Main window … did not appear" also fail with the captured errors.
- **Only the pack under test fails fast.** The renderer's message now includes the pack URL (`Failed to load FE entry pack://<packId>/dist/fe.js`, `packages/renderer/src/packs/pack-loader.ts`). Other installed packs' errors are reported but don't abort the run.
- `abuddy build` now exits non-zero when the FE bundle fails, and the new BE compile failure check does the same. Previously either failure printed a message, exited 0, and left the previous build in `dist/`, where the fixture and loader used it.

**Mutation check:** a pack whose FE entry throws now fails in 4.7s with `Pack FE failed to load … Error: PROBE FE boom`. It used to time out after 30s. The monorepo smoke suite still passes.

Docs updated: `packages/abuddy-sdk/src/testing/CLAUDE.md`, `tests/e2e/CLAUDE.md`. Related open issues: N3, N4.

### 5. Unproxied SDK imports in pack frontend code — ✅ resolved

`packExternalsPlugin` (`fe-bundler.ts`) now **fails the build** when the SDK's host-module registry (`runtime/host.ts`) ends up in the rendered FE bundle. The error names the import chain and the SDK modules the renderer shares.
- The check runs in `generateBundle` and only counts code that survives tree-shaking.
- Covered by `packages/abuddy-sdk/tests/build/fe-bundler-host-registry.spec.ts`. An inlined `@abuddy/sdk/logger` fails with the chain `src/entry.ts → @abuddy/sdk/logger/index.ts → @abuddy/sdk/runtime/host.ts`, while proxied `rpc` plus pure `utils/pure` build fine.

**It caught a real latent case.** The example pack's `fe.js` contained the calendar backend repository, EARS helpers and the host registry (91 KB):
- The FE imported `busId` from `#generated/system-ids`.
- That file re-exports every backend system module.
- `be/system.ts`'s side-effect import `./repository/index` kept all of it in the bundle.

It only avoided crashing because `getHostModule` was called lazily. The fix:
- Codegen now emits `busId` into a new import-free `src/__generated__/bus-ids.ts`. `system-ids.ts` re-exports it, so backend imports are unchanged.
- The example pack's FE imports from `#generated/bus-ids`, and `fe.js` is now 58 KB with no backend code.

**Behaviour change for pack authors:** a pack FE that still imports `busId` from `#generated/system-ids` now fails `abuddy build` with the chain and fix instructions.

### 6. No CI coverage for the external-pack path — ✅ resolved locally

**Added:**
- `tests/fixtures/external-pack/`: a checked-in pack derived from `abuddy init` + `abuddy add feature memos`. It has an EARS entity, a compiled CJS system, an FE plugin using `#generated/bus-ids`, `@abuddy/sdk/rpc` and pack Tailwind, with no seeds (see N1).
  - `memos.spec.ts` checks that a pack-only `p-[13px]` class applies, compares a visual baseline, and runs an add-memo round trip through the pack backend.
- `tests/scripts/test-external-pack.sh`, run as `npm run test:external-pack`. It runs `abuddy validate`, `abuddy build`, `tsc --noEmit` on the pack, then `abuddy test` from the pack directory.
- `.github/workflows/ci.yml` gets a new `external-pack-e2e` job (install, `npm run build`, `npm run test:external-pack`, upload test output on failure) and an `sdk` unit-test step in `check`.

**Verification:**
- The script passes locally (2/2).
- Mutation checks fail as expected: suppressing `MEMO_ADDED` fails the round trip, and changing the pack-only class fails the style assertion.
- **Not yet run on a GitHub runner.** CI triggers are still manual-dispatch only, and the darwin screenshot baseline may need regenerating if the runner's font rendering differs.

### 7. Pack typecheck — ✅ template/codegen fixed; remainder is item 3

The fixture was scaffolded from the `init` template, and it initially hit the same errors as the example pack. The causes were in the template and codegen, not the pack code:

| Cause | Fix |
|---|---|
| `#generated/*` not resolvable by TypeScript (subpath import targets get no extension probing) | `init` tsconfig template adds `paths: { "#generated/*": ["./src/__generated__/*"] }` |
| No `*.vue` module declaration | `init` writes `src/env.d.ts` |
| `.abuddy/generated/types.ts` imported `../__generated__/ears` (wrong dir) | `emitDepTypes` imports `../../src/__generated__/ears` |
| `pack-entry.ts` imports `./seeders`, which wasn't generated for packs without seeds | `seeders.ts` is always emitted with the compiledDir accessors |
| `TS2352` on the generated `RelKind` cast when a pack declares no rel kinds | cast via `Record<string, unknown>` |
| `EARS.Entity.Action` in `seeders.ts` for packs seeding actions without depending on `default-setup` | collection seeders use the entity name as a string literal |

**Regression found and fixed along the way:** the new tsconfig `paths` broke `be-bundler.ts`. Its alias plugin returned extensionless paths (`Cannot read file …/__generated__/ears`), and the system compile failure didn't fail the build. The alias plugin now resolves extensions, and failed system compiles exit 1.

**Results:**

| Pack | Before | After |
|---|---|---|
| Fixture | failing | 0 errors (enforced by the CI script) |
| Fresh `abuddy init` + `add feature` | failing | 1 error (`keepAlive`, N1) |
| Example pack (after applying the template's tsconfig and `env.d.ts`, and fixing a `./state.ts` import) | 50 | 35, all from uninstalled host-shared deps; **0** with those mapped (item 3) |

### 8. Visual baselines — ✅ resolved

`toHaveScreenshot` now runs on regions that don't depend on data:
- The fixture's memo form: `tests/fixtures/external-pack/tests/e2e/memos.spec.ts-snapshots/memos-form-darwin.png`.
- The calendar toolbar, with the date label masked: `example-pack/tests/e2e/calendar.spec.ts-snapshots/calendar-toolbar-darwin.png`.

**Tolerance:** `maxDiffPixelRatio: 0.01`.
- Stripping the form's utility classes (the A8 regression class) fails, with 39% of pixels differing.
- A small padding change on dim placeholder text passes. That's a deliberate trade-off against cross-machine noise.

Update baselines with `-u`.

### 9. Cleanup — ✅ resolved

- Deleted `packages/default-setup/.abuddy/generated/ears.ts` (confirmed no importers).
- Deleted `tests/e2e/scratch.spec.ts` (duplicate calendar suite).
- `packages/default-setup/CLAUDE.md`: 12 features without calendar, and the `ears.ts` description corrected. `bus-ids.ts` added there and in `docs/public-facing/architecture.md`.
- Auto-memory: the stale calendar recipe is replaced by a pack-layout note.

### 10. Agent guardrails — ✅ resolved

`tests/e2e/CLAUDE.md` has a new **Rules for agents** section:
- No broad process kills.
- E2E runs alongside dev and prod in the `abuddy-test` namespace.
- Investigate failing assertions before changing them.
- Test data persists across runs.
- `abuddy` may be a shell alias.

Stale fixture-lifecycle text there was also corrected (packs dir, always-rebuild, fail-fast, calendar plugin ID).

### New findings from this pass — ⏸ open

| # | Finding | Evidence | Notes |
|---|---|---|---|
| N1 | **A freshly scaffolded pack can't build.** `init` declares `"default-setup": "*"`, which can't resolve outside a workspace layout (`abuddy fetch-deps` → `Failed to resolve: default-setup`; the registry lookup is a stub). The template's example flow then fails with `does not provide an export named 'keepAlive'`. Even with a `file:` dependency, the build fails with `No trigger types provided`: external pack builds register only the pack's own step definitions, so a flow using host steps can't compile. | Scaffold in `untracked/`: `abuddy init` + `add feature` → `abuddy build` exit 1 | Design decision: how external packs get dependency snapshots and step definitions at build time. The fixture avoids seeds for now. |
| N2 | **`abuddy add feature` accepts hyphenated IDs, but the generated TS is invalid** (`settings.ts`: `{ notes-lite: true }`; `system-ids.ts`: `export { notes-lite }`). The manifest schema allows any string. | `add feature notes-lite` → `abuddy build`: `Expected "}" but found "-"` | Decision: restrict IDs to identifiers, or quote and camel-case them throughout codegen. |
| N3 | **The test packs dir isn't isolated per pack.** Every pack installed in `abuddy-test/packs` loads in every E2E run, and the `abuddy-test` data dir persists across runs. | A stale mutated `abuddy-external` build broke the fixture's run until re-synced; accumulated events caused item 1. Fail-fast is now scoped to the pack under test. | Options include a per-run temp user-data dir for pack E2E. |
| N4 | **The fixture's `.dev` check looks in the dev packs dir, but the test app reads the test packs dir.** While `abuddy dev` runs, the fixture skips build and sync, so tests use whatever was last synced to `abuddy-test/packs`. | Code reading: `testing/index.ts` (`devSignal` under `getPacksDirForEnv('development')`) vs sync target `getPacksDirForEnv('test')` | Not reproduced by a run. |
| N5 | **Month grid shows zero chips when a cell fits one row and holds two or more events.** | `MonthGrid.vue` `visibleCount`: capacity 1 → `capacity - 1 = 0` | Example-pack UX; design choice. |

### Secondary review findings (`~/.claude/plans/fix-4-ticklish-crown.md`), re-checked on HEAD

| # | Status on HEAD |
|---|---|
| F2 | **Still applies.** `packages/api/tests/integration/pack-e2e.spec.ts:32` hardcodes `~/Library/Application Support/abuddy/packs` and deletes `USER_DATA_PATH` (`:117`). No `RUN_INTEGRATION` gate exists, despite `vitest.config.ts:21`. |
| F3 | **Still applies; needs your decision.** `getPacksDir()` still falls back to `resolveAppDataDir('production')` (`pack-discovery.ts:94`). |
| F4 | **Still applies.** `UNBRIDGED_BY_DESIGN` still mixes the policy-only `actions`, which has extensionless relative re-exports, with the true leaves. |
| F5 | **Still applies.** Nothing asserts that the leaf entries have no imports. |
| F6 | **Still applies.** `startsWith('@abuddy/sdk/fe')` has no `/` boundary (`sdk-bridge-drift.spec.ts:58,79`). |
| F7 | **Still applies.** Assertion 3 has no fe filter. |
| F8 | **Still theoretical.** All 7 wildcard exports are still `./fe/*`. |
| F9 | **Still applies.** Nothing checks `UNBRIDGED_BY_DESIGN` for staleness. |
| F10 | **Still applies.** No test asserts the "No machine export found" message. Separately, `pack-loader.spec.ts` fixtures still used the removed `plugins` key, so the CJS-load test failed and five "0 systems" tests passed vacuously. They now use `features`, and all 24 pass. |
| F11 | **Still applies.** `packages/renderer/src/packs/pack-loader.ts` still does `mod.default \|\| mod` with no warning when an entry registers nothing. |
| — | The stale `exportName` fields in the example pack are gone. |

---

## Resolved (re-verified still in place)

| # | Issue | Symptom during session | Fix | Check |
|---|---|---|---|---|
| A1 | External system IDs prefixed on the backend, unprefixed on the frontend | FE→BE events unroutable (`Unknown system: "abuddy-external.calendar"`) | generated `busId` map in `system-ids.ts` | pack uses `busId.calendar` ×3, no bare `systemId: id`; probe shows correct routing |
| A2 | Loader read `manifest.plugins` only | pack registered 0 systems | loader reads `manifest.features` (`plugins` since removed) | `pack-loader.ts:320,405` |
| A3 | Renderer boot deadlock (circular top-level-await chunk) blocked **all** E2E tests, including the monorepo's own | `Main window with applicationState did not appear within timeout`; error page with empty stack | static built-in pack imports; `modulePreload: false` | `renderer/vite.config.ts` |
| A4 | FE bundler exported the namespace object as `default` | `TypeError: __m$3 is not a function` | `export default __m.default` | `fe-bundler.ts:35` |
| A5 | `@abuddy/sdk/rpc` not proxied | `SDK host module "trpc" not registered` | added to `SDK_FE_MODULES` | `shared-deps.ts` (missing guard tracked as item 5) |
| A6 | Pack systems loaded as ESM bypassed host resolution | `Cannot find package 'xstate'` → `'@abuddy/sdk'` → `Cannot use import statement outside a module` | new `be-bundler.ts` compiles systems to `dist/systems/*.cjs` | `build.ts` calls `bundlePackSystems` |
| A7 | `SystemEntry` wrapper used as the machine | `this.logic.getInitialSnapshot is not a function` | `raw.machine ?? raw` | `pack-loader.ts` |
| A8 | Pack CSS had no Tailwind utilities | broken grid; every test still passed | Tailwind/PostCSS in `fe-bundler.ts` | `tailwind-inject` plugin |
| A9 | Test app shared the dev app's single-instance lock and packs dir | `Another dev instance is already running`; `Plugin "calendar" did not load within 30s` | `abuddy-test` namespace; `getPacksDirForEnv('test')` | `SingleInstanceApp.ts`, `testing/index.ts` |
| A10 | `bookmarks` system had a named export only | `No machine export found in src/features/bookmarks/be/system.ts` (named the wrong file), ignored for ~16h | `export default bookmarksEntry`; loader diagnostic names the loaded file (`a1a86d498`) | both systems load |
| B3 | Pack's own E2E suite never ran green from the pack | `Requiring @playwright/test second time` / `No tests found` / `playwright: command not found`; all green runs used a monorepo copy | resolved as a side effect of A9 plus the Playwright symlink | **`abuddy test` from the pack: 7 passed** (remaining dependencies tracked as items 2 and 3) |
| — | Stale default-setup and renderer `dist` | `compiledDir not initialized — pack loader must call setCompiledDir()`; renderer still bundled calendar | rebuilt | n/a |
| — | Dead `exportName` keys in pack manifest | rejected once the manifest schema became strict | removed | `abuddy validate` |

## Corrections to the first version of this report

The first draft (same day) was written from the session transcript alone. Re-verifying against current code changed four conclusions:

- **B3 (pack suite never passes from the pack):** no longer true. `abuddy test` from the pack passes 7/7. What remains is the monorepo dependency (item 3).
- **B2 (`init-tests` advice causes the dual install):** too broad. The SDK already declares `@playwright/test` as a peer; the conflict only occurs because the pack uses an `npm link`ed SDK.
- **B6 (`generate --force` fails to remove stale `CalendarEvent`):** wrong mechanism. `generate` no longer writes that file at all; it's an orphan with no importers, so this is cleanup rather than a generator bug.
- **A4 edge (module without a default export yields `undefined`):** dropped. A default import of a module without one is a TypeScript error at the call site, so it isn't a practical risk for typed packs.

T1 was also upgraded from "unverified" to a confirmed live bug (item 1).

---

## Session timeline (UTC, 2026-09-12)

| Time | Event |
|---|---|
| *(planning)* | System ID prefixing gap found → `busId` codegen (A1) |
| 02:33–02:36 | Calendar moved to the pack and removed from default-setup; commit `e63fd0f1c` |
| 02:41–02:43 | Playwright in the pack: dual install → module not found → symlinked from monorepo |
| 02:43 | First run from the pack: 5 failed |
| 02:44 | Inventory requested (unanswered) |
| 02:47 / 02:48 | *"im not running try again, also run headless please"* / *"wtf are u talking about.. just try running the tests"* |
| 02:52 | `compiledDir not initialized` (stale dist) |
| 02:57 | `Cannot find package 'xstate'` for pack systems |
| 02:59–03:40 | Monorepo smoke tests fail too → renderer deadlock found and fixed (A3) |
| 03:42 | Work moves to a monorepo copy of the spec; `__m$3 is not a function` (A4) |
| 03:47–04:00 | `trpc not registered` (A5); failed symlink/`commonjs` workarounds; `be-bundler.ts` (A6) |
| 04:14 / 04:22 | *"u killed the prod app... please dont do that again."* / *"yes it can run beside the prod app…"* |
| 04:26 | `getInitialSnapshot is not a function` (A7); bookmarks warning ignored (A10) |
| 04:28 → 04:31 | Create-event assertion fails → loosened → 5/5 green (item 1) |
| 04:39 | User screenshot shows broken styles → Tailwind fix (A8) |
| 06:01 → 06:09 | 5 failed (single-instance lock, wrong packs dir) → test namespace (A9) → green |
| 06:21 → 19:28 | Scope moves to app namespacing, beta channel, semver, manifest schema |

## Themes

1. **The external-pack path had never been exercised.** Built-in packs take different routes (static imports, the host's Tailwind, bundled systems), so nothing caught these bugs. Item 6 closes that gap.
2. **Failures degrade silently.** The loader warns and continues, the fixture skipped waits and reused stale `dist/`, the bundler inlined without warning, and `abuddy build` exited 0 on FE and system compile failures. Each bug first showed up as a generic timeout, or not at all. Items 4 and 5 addressed this pattern.
3. **The pack dev loop assumes the monorepo:** CLI runtime, `ABUDDY_ROOT`, Playwright resolution (items 2 and 3).
4. **Green tests aren't the goal.** The one assertion that checked backend behaviour was loosened to pass, so nothing verified the round trip. When it was finally investigated, the cause was test data accumulating across runs, not the product. That's cheap to fix, but only once someone looks.

## Related

- `docs/issues/postmortem-default-setup-compile-stale.md` — earlier stale-artifact incident
- `docs/external-pack-fe-deps.md`, `docs/pack-install-flow.md` — external pack FE deps and install design
- `packages/abuddy-sdk/src/testing/CLAUDE.md` — pack E2E fixture (items 3, 4)
- `packages/api/tests/unit/sdk-bridge-drift.spec.ts` — backend drift guard to mirror (item 5)
- Commits: `e63fd0f1c` (extraction), `a1a86d498` (loader diagnostic)
