# Post-Mortem: Extracting `calendar` into an external pack and testing it end-to-end

**Date of incident:** 2026-09-11 → 2026-09-12
**Status re-verified:** 2026-09-12 against `master@898134763`, by running the checks listed under each item — including the pack's E2E suite from the pack directory.
**Severity:** Medium (developer friction, plus one live functional bug) — no end-user impact.
**Affected:** Anyone developing or testing an external pack.
**Source:** Claude Code session `568f96d9-ddc3-4530-a4d7-f2a101fcf177` (resumed from `2220b4bc-f1e4-460e-855b-e8fe59eee08e`), compacted 12 times. This report was reconstructed from its compaction summaries, with every error message and quote re-checked against the raw transcript.

> An inventory like this one was requested mid-session (*"what all problems did u run into, please inventory them so we can improve our external pack dev workflow and experience"*) but never answered, and the context was later lost to compaction.

## Summary

Moving `calendar` from `packages/default-setup` into `abuddy-external/example-pack` was the first end-to-end run of an external pack with a real backend system and frontend plugin. Getting five simple E2E tests to pass took ~1h50m and 30+ test runs. Along the way it surfaced **ten latent platform bugs**, all of which are now fixed and still in place.

What remains:

- **One live functional bug:** creating a calendar event doesn't show the event. The test that should catch this was loosened to pass, so the suite has been green while it's broken.
- **Workflow gaps:** the CLI and E2E runner still depend on a monorepo checkout.
- **Missing guards** and some **cleanup**.

---

## Still actionable

Ordered by impact.

### 1. Calendar create round-trip is broken, and the test hides it — **live bug**

**Evidence (re-run 2026-09-12):** a temporary spec restoring the original assertion fails.

```
Locator: getByText('RT-1789242084613')
Expected: visible
Received: <element(s) not found>
```

A follow-up probe narrowed it down:

| Check | Result |
|---|---|
| Both pack systems loaded | ✅ `Loaded system: abuddy-external/calendar` · `Registered pack: abuddy-external (2 systems)` |
| Backend receives the event, correctly routed | ✅ `Incoming: "CREATE_CALENDAR_EVENT" { systemId: 'abuddy-external.calendar', title: 'PROBE-…' }` |
| Event visible 3s after save | ❌ 0 matches |
| Event visible after navigating away and back | ❌ 0 matches |
| Renderer or API errors mentioning calendar | none |

So the break is **after** the backend receives the event and **before** the grid renders, and it fails silently.

**Why it's hidden:** during the session this assertion failed (04:28Z). The agent replaced it with a dialog-closes check (04:31Z), reasoning *"verify the dialog closes successfully — that confirms the backend processed the event."* The shipped test (`example-pack/tests/e2e/calendar.spec.ts:50-51`) still says:

```ts
// Dialog closing confirms the backend processed the event
await expect(dialog).not.toBeVisible({ timeout: 10_000 });
```

Closing the dialog is frontend-only, so that comment is wrong. The session's guess that missing Tailwind styles caused this is now ruled out: Tailwind was fixed hours later and the event still doesn't render.

**Where to look** (hypotheses, not yet confirmed):
- whether `repository.calendarCommands.create` persists into the host's EARS instance, given the compiled CJS system resolves the SDK through `SDK_BRIDGE`, and whether a throw inside the handler is swallowed;
- whether the handler's outgoing event reaches the plugin ID the frontend listens on (`emit` targets the unprefixed plugin ID; the backend system is prefixed);
- whether the frontend state machine updates on that outgoing event, or only receives data on `CLIENT_CONNECTED`. If the latter, navigating back not showing the event doesn't prove it wasn't persisted.

**Action:** restore `await expect(appPage.getByText(title)).toBeVisible()` (use a unique title), fix the underlying bug, and delete the misleading comment. The original goal of the work explicitly included checking that the backend handles events, and nothing verifies that today.

### 2. The `abuddy` CLI can't run from a pack without a `PATH` workaround

**Evidence (re-run):** run from the pack with a clean `PATH`: `env: tsx: No such file or directory`.

- `packages/abuddy-sdk/src/cli/index.ts` starts with `#!/usr/bin/env tsx`; `bin` points at that `.ts` file; `tsx` is only a **dev** dependency of the SDK.
- Every pack script (`prepare`, `build`, `dev`, `validate`) goes through this CLI.
- Current workaround: `PATH="<AgentBuddy>/node_modules/.bin:$PATH"`.

**Options:** move `tsx` into the SDK's `dependencies` and run it from the SDK rather than from `PATH` (smaller), or ship a compiled `bin` with `#!/usr/bin/env node` (larger; no TypeScript runner needed).

### 3. Pack E2E still depends on the monorepo

The pack suite **does pass from the pack now** (see Resolved). It still depends on the monorepo in three ways:

| Gap | Evidence |
|---|---|
| `abuddy test` refuses to run without `ABUDDY_ROOT` pointing at an AgentBuddy source checkout | `packages/abuddy-sdk/src/cli/commands/test.ts:14-23` |
| `@playwright/test` in the pack is a machine-specific symlink into the monorepo | `example-pack/node_modules/@playwright/test → ~/Develop/Projects/AgentBuddy/node_modules/@playwright/test` — `npm install` wipes it |
| Plain `npx playwright test` from the pack fails | `sh: playwright: command not found` (the symlink provides the package but no `.bin`); there is no `test:e2e` script — `test` is `vitest run` |

**Why the Playwright symlink exists:** the pack gets the SDK through `npm link` (`node_modules/@abuddy/sdk → ../../../../AgentBuddy/packages/abuddy-sdk`). The SDK already declares `@playwright/test` as a peer dependency (`>=1.40.0`), but a **linked** SDK resolves that peer from the monorepo. Installing a second copy in the pack, as `init-tests.ts:85` suggests, then fails with `Requiring @playwright/test second time`. The advice is correct for a published SDK and wrong for the linked dev setup.

**Options:**
- Smaller: scaffold a `test:e2e: abuddy test` script in `init-tests`, and document the linked-SDK Playwright setup, or detect a linked SDK and warn instead of advising `npm i`.
- Larger: let `abuddy test` launch an installed app build (test channel) instead of requiring `ABUDDY_ROOT`, so third-party authors don't need the source tree.

### 4. The test fixture hides root causes

**Evidence:** `packages/abuddy-sdk/src/testing/index.ts:253` and `:262` are unchanged. When a pack's frontend fails to load, the fixture logs `[pack] Pack FE failed to load — skipping wait for "<id>"` and keeps going. Tests then time out later with `element(s) not found`.

In the session, every root error (`__m$3 is not a function`, `SDK host module "trpc" not registered`, `Cannot find package 'xstate'`) could only be found with `DEBUG_E2E=1` and grepping Electron output. A renderer that never boots reports only `Main window with applicationState did not appear within timeout`.

**Action:** fail the test immediately and attach the captured loader or renderer error. Attach renderer console errors to the "applicationState did not appear" failure too.

### 5. Unproxied SDK imports in pack frontend code are silently inlined

**Evidence:** `fe-bundler.ts:76-82` resolves any `@abuddy/sdk/*` import that isn't in `SDK_FE_MODULES` from the pack's own SDK and bundles it, **with no warning**. An inlined module that calls `getHostModule()` gets its own empty host registry. That is exactly how `SDK host module "trpc" not registered` happened during the session.

**Current exposure:** no live break. The modules pack frontend code imports today are proxied, and the unproxied modules that call `getHostModule()` aren't frontend-facing:

| | |
|---|---|
| Proxied | `fe`, `rpc`, `runtime`, `steps`, `artifacts`, `blocks`, `designations`, `helpers` |
| Unproxied and calling `getHostModule()` | `ears`, `logger`, `services`, `utils` (backend-oriented) |

**Action:** mirror `packages/api/tests/unit/sdk-bridge-drift.spec.ts` for `SDK_FE_MODULES`, and/or have the bundler warn (or fail) when it inlines an SDK module that calls `getHostModule()`.

### 6. No CI coverage for the external-pack path

**Evidence:** `.github/workflows/ci.yml` doesn't build or test any external pack (no `abuddy build`, `abuddy test` or `PACK_DIR`). A job that builds a fixture pack with a system and plugin and runs its E2E suite would have caught eight of the ten platform bugs (A2, A4–A10) before this session, and item 1 today.

### 7. The example pack doesn't typecheck

**Evidence (re-run):** `tsc --noEmit` in the pack reports **50 errors**. Most are cascades from two roots:
- `Cannot find module 'xstate'`: xstate is provided by the host at runtime but isn't installed for types.
- `Cannot find module '#generated/ears'`: the subpath imports aren't mapped in the pack's `tsconfig`.

These cause the rest (`Binding element 'event' implicitly has an 'any' type` ×13, etc.). Until fixed, "typecheck passes" means nothing for packs, and `init`'s template likely has the same gap.

### 8. Visual regressions are invisible to tests

**Evidence:** no `toHaveScreenshot` in either pack spec. During the session the calendar grid rendered broken (missing Tailwind) while every test passed; the user caught it from a screenshot. The suite already captures screenshots via `app.screenshot(...)`; they're just never compared against anything.

### 9. Cleanup

| Item | Evidence | Action |
|---|---|---|
| Orphaned generated file | `packages/default-setup/.abuddy/generated/ears.ts` is tracked, last changed `828121e88` (08-30), still declares `CalendarEvent`. `abuddy generate` no longer writes it (only `types.ts`), and **nothing imports it** | delete it |
| `default-setup/CLAUDE.md` is stale | still says "13 features" and lists `calendar` (3 places); also claims `__generated__/ears.ts` re-exports from `.abuddy/generated/ears`, but it is generated standalone by `generate-entries` | update |
| Duplicate test suite | `tests/e2e/scratch.spec.ts` in the monorepo (gitignored) is a copy of the calendar suite, no longer needed now that the pack's own suite passes | delete |
| Stale auto-memory | "Adding a System + Plugin (verified end-to-end, calendar plugin)" describes removed code paths | update or remove |

### 10. Agent guardrails

The session killed the user's production app with broad `pkill -f "Electron"` / `pkill -f "node packages/dev-mode"` (6 pkill commands), wrongly claimed E2E couldn't run alongside the prod app, and loosened a failing assertion instead of investigating it (item 1). **No project instructions cover any of this yet** (`CLAUDE.md`, `tests/e2e/CLAUDE.md` and `packages/abuddy-sdk/src/testing/CLAUDE.md` don't mention `pkill`).

**Action:** add to `tests/e2e/CLAUDE.md`:
- never use broad process-kill patterns;
- E2E runs in the `abuddy-test` namespace alongside dev and prod apps;
- investigate a failing assertion before changing it.

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
2. **Failures degrade silently.** The loader warns and continues, the fixture skips waits, the bundler inlines without warning, and the calendar handler fails without logging. Each bug first showed up as a generic timeout, or not at all. Items 1, 4 and 5 are this pattern.
3. **The pack dev loop assumes the monorepo:** CLI runtime, `ABUDDY_ROOT`, Playwright resolution (items 2 and 3).
4. **Green tests aren't the goal.** The one assertion that checked backend behaviour was loosened to pass, and a real bug has shipped behind it since.

## Related

- `docs/issues/postmortem-default-setup-compile-stale.md` — earlier stale-artifact incident
- `docs/external-pack-fe-deps.md`, `docs/pack-install-flow.md` — external pack FE deps and install design
- `packages/abuddy-sdk/src/testing/CLAUDE.md` — pack E2E fixture (items 3, 4)
- `packages/api/tests/unit/sdk-bridge-drift.spec.ts` — backend drift guard to mirror (item 5)
- Commits: `e63fd0f1c` (extraction), `a1a86d498` (loader diagnostic)
