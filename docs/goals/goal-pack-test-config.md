# Goal: a pack's test config is a call, not a copy

> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-26). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: a pack's test config is a call, not a copy

Implement docs/goals/goal-pack-test-config.md on AS/test-pipeline, at or after 232f85e78 — the base its
Background was surveyed at.
Before Phase 1, confirm the base: `cd packages/default-setup && npx vitest related --run
src/features/notes/be/system.ts` fails with "Install @vitejs/plugin-vue", and packages/default-setup,
tests/fixtures/external-pack and abuddy-cli's VITEST_CONFIG_TEMPLATE hold three different vitest configs.
If either is already false, stop and say so — the survey was taken somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. The Open decision must be settled with the user before Phase 1; if it is still
marked open, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — it is a standing
rule, not this goal's choice): change signatures, move modules, migrate every in-repo caller, test,
fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard is mutation-checked.
- One function defines a pack's vitest config, and packages/default-setup, every fixture pack and the
  `abuddy init` template call it rather than restating it.
- `npx vitest related` and `--changed` work inside a pack, and `npm run spec -- <pack source>` runs the
  specs that cover it rather than that pack's whole suite. The before and after are measured and recorded.
- npm run typecheck; npm run api:update committed if a published entry moved; npm run test:external-pack;
  npm run test:packaged-authoring; npm run chain once at the end.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.
- The doc is in `docs/archive/goals/`, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Check `git diff --cached` first: another agent works in this checkout and stages files.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- delete or loosen a test to make a number move.
- declare the `@abuddy/source` condition in a pack's config: `check:specifiers` refuses it, and the reason
  is the whole point of the two pools.
```

## Background (surveyed 2026-09-26 at `232f85e78`)

`@abuddy/testing/vitest` exports one thing, `isolatedDataDir()`. Everything else a pack's vitest config needs
is copied, and the three copies have already drifted:

| | plugins | `globals` | timeouts | `fileParallelism` | `exclude` |
|---|---|---|---|---|---|
| `packages/default-setup/vitest.config.ts` | `tsconfigPaths` | ✓ | 15s / 15s | ✓ | `_support/**` |
| `tests/fixtures/external-pack/vitest.config.ts` | — | **✗** | — | — | `tests/e2e/**` |
| `abuddy-cli`'s `VITEST_CONFIG_TEMPLATE` (`init.ts:125`) | — | ✓ | — | — | `tests/e2e/**` |

The fixture pack runs without `globals` while the scaffold sets it. Nobody decided that; it is what three
copies do.

### No pack's test config can load the pack's own frontend

`abuddy add feature` writes `fe/plugin.ts` importing `canvas/list.vue`. No pack's vitest config has
`@vitejs/plugin-vue`, so the first spec that reaches a plugin module fails with *"Install @vitejs/plugin-vue
to handle .vue files"* — in the pack author's own repo, about a file the CLI generated for them.

Nothing in the repo hits it today only because no pack spec imports a plugin module. `vitest related` does,
because it walks the whole graph from the changed file:

```
$ cd packages/default-setup && npx vitest related --run src/features/notes/be/system.ts
Error: Failed to parse source for import analysis because the content contains invalid JS syntax.
Install @vitejs/plugin-vue to handle .vue files.
```

### Two mechanisms for one fact: a pack's aliases

Adding the plugin exposes the second layer:

```
Error: Failed to resolve import "@/__generated__/events" from "src/extensions/steps/subflow/form.vue".
```

`abuddy build`'s FE bundler reads the pack's `tsconfig.json` `compilerOptions.paths` itself and converts them
to Vite `resolve.alias` (`abuddy-cli/src/build/fe-bundler.ts:306`, `readTsconfigAliases`), which applies to
every importer including `.vue`. The pack's *test* config uses `vite-tsconfig-paths` on the same tsconfig,
which by default resolves only from TypeScript and JavaScript modules. `loose: true` is the documented switch
(`vite-tsconfig-paths`' `PluginOptions`: *"Useful if you want asset URLs in Vue templates to be resolved"*).

Two readers of one file, disagreeing on one extension. With both fixes applied by hand, measured
2026-09-26 in `packages/default-setup`:

| Changed source | Specs found | Wall |
|---|---|---|
| `features/brain/be/flow-system.ts` | 3 | 2.8s |
| `extensions/steps/llm/runtime.ts` | 3 | 2.7s |
| `seeds/actions/claude-code/_helpers/auto-approve.ts` | 3 | 2.8s |
| `features/threads/be/system.ts` | 1 | 2.6s |

Against **18s** for the whole suite, which is what `npm run spec -- <pack source>` runs today
([`goal-spec-follows-the-graph.md`](../archive/goals/goal-spec-follows-the-graph.md)'s Outcome records why it
runs anything at all: it used to run nothing and exit 0).

### The dependency is already in the tree, in the right package

`@vitejs/plugin-vue` is a devDependency of `@abuddy/cli` — the pack toolchain, which needs it to bundle a
pack's frontend — and of `@app/renderer`. So Vue compilation for pack sources is already the toolchain's job;
what is missing is that the *test* half of the toolchain doesn't do it.

## Decisions

Final.

1. **One function defines a pack's vitest config**, exported from `@abuddy/testing/vitest` beside
   `isolatedDataDir`. That package is already every pack's test-time dependency and already owns the data-dir
   half of the config; the rest belongs with it. A pack's config becomes a call plus whatever that pack adds.
2. **It holds the Vue plugin and the pack's aliases**, so a pack can load its own frontend and a graph walk
   works. Aliases come from the pack's `tsconfig.json` the way `abuddy build` already reads them, or from
   `vite-tsconfig-paths` with `loose: true` — Phase 1 picks one and records why, and the point either way is
   that **the test config and the FE bundler stop disagreeing about `.vue`**.
3. **It declares no `@abuddy/source` condition, ever.** A pack resolves the published `dist` because that is
   the one layout a pack author has, `check:specifiers` refuses a pack config that declares the condition, and
   this helper must not become the place that quietly does it. The two pools (`UnitSuite.kind`) depend on it.
4. **The built-in pack, every fixture pack and the `abuddy init` template all call it.** A reference pack that
   does not look like what the tool generates is how the three copies happened; nothing that can call it keeps
   a copy.
5. **`npm run spec` narrows a pack source file once the graph walks.** `ownSuiteFor` in
   `scripts/lib/spec-plan.ts` plans the pack's whole suite today with a comment pointing here; Phase 3 turns
   that into `related` inside the pack, which is 2.6s against 18s, and keeps `packages:ensure` in front of it
   for the same reason a root run does.
6. **A guard, because this is a copy-paste failure by nature.** A check that every pack's vitest config calls
   the helper — the built-in pack, the fixture packs, and the CLI's template as text — so the fourth copy
   fails rather than drifts.

## Open decision — how a pack gets the two packages

`definePackTestConfig` needs `@vitejs/plugin-vue` and (if Decision 2 takes that route) `vite-tsconfig-paths`
at the pack author's install, not just in this repo.

- **Dependencies of `@abuddy/testing`.** A pack author installs one devDependency and their frontend specs
  work. Cost: two packages every pack downloads, including a pack with no `.vue` files at all, and
  `@abuddy/testing` currently keeps `vitest` and `@playwright/test` as *peer* dependencies, so this breaks its
  own pattern.
- **Peer dependencies, listed by `abuddy init`.** Keeps `@abuddy/testing` honest about what it is a wrapper
  around and matches `vitest`'s treatment. Cost: a pack that does not install them gets a resolution error
  from a config file, which is a worse first experience than a slightly bigger install; and `abuddy doctor`
  probably has to say so.
- **Optional, detected.** The helper adds the Vue plugin only if the package resolves, so a pack with no
  frontend needs nothing. Cost: a silent difference between two packs' configs, which is the class of problem
  this goal exists to remove.

## Phases

### Phase 1 — the function, and the built-in pack calls it

Add `definePackTestConfig` to `@abuddy/testing/vitest`: the Vue plugin, the pack's aliases, `globals`, the
include/exclude (`tests/**/*.spec.ts`, less `tests/e2e/**` and any `_support/**`), the tier-1 timeouts and the
data-dir wiring. `packages/default-setup/vitest.config.ts` becomes a call plus its own `_support` exclusion.
`npm run api:update` if the entry's surface moved, committed.

**Done when:** `npx vitest related --run src/features/notes/be/system.ts` inside `packages/default-setup`
reports the covering specs rather than an error; `npm test -w @app/default-setup` is 87 files and 720 tests,
unchanged; and default-setup's config states nothing the helper already says.

### Phase 2 — the fixture packs and the scaffold

`tests/fixtures/*/vitest.config.ts` and `abuddy-cli`'s `VITEST_CONFIG_TEMPLATE` call it too. The CLI's scaffold
specs and `docs/public-facing/testing.md` show the call.

**Done when:** `npm run test:external-pack` and `npm run test:packaged-authoring` pass with their counts
unchanged (10 files / 32 tests for `external-pack`'s vitest half), and no pack config in the repo restates
what the helper holds.

### Phase 3 — `spec` narrows inside a pack

Turn `ownSuiteFor`'s whole-suite run into `related` inside that pack, `packages:ensure` in front. Measure and
record: the same four files as the Background table, before (18s) and after.

**Done when:** `npm run spec -- packages/default-setup/src/features/brain/be/flow-system.ts` runs 3 files in
about 3s, `spec-plan.spec.ts` asserts the plan, and the comment in `spec-plan.ts` pointing at this goal is
replaced by what the code now does.

### Phase 4 — the guard

A check that every pack vitest config in the repo calls `definePackTestConfig`, and that the CLI's template
does as text. Mutation-check it by restating `globals` in one config by hand.

**Done when:** the guard passes, has been made to fail, and `npm run chain` is green.

## Deferred

- **Making a pack suite resolve workspace source** so no seam exists. Rejected rather than deferred: the pack
  suite exists to check that a pack works against the `dist` a pack author installs, `packages:check` and
  `test:packaged-authoring` defend that boundary, and dissolving it would make the largest suite test
  something nobody ships.
- **A pack's Playwright config**, which has the same copy-paste shape (`abuddy init-tests` scaffolds one).
  Worth the same treatment, and a separate change: it runs a different runner against a built app.

## Constraints

- **Counts before and after, every suite this touches.** A config change's characteristic failure is a spec
  that stops being collected, and `include`/`exclude` is exactly what this moves.
- **Measure on an idle machine, and say what you measured on.** The 2.6s figures above were taken with the
  plugin added by hand and reverted; re-take them on the real implementation.
- **`@abuddy/testing` resolves its built bundle for everyone**, the repo's own E2E included
  (`packages/abuddy-testing/CLAUDE.md`), so a change here needs that bundle rebuilt before any pack suite
  sees it — `npm run packages:ensure` does it, and every entry point that triggers it is listed in that file.
- **Don't relitigate settled decisions.** The two pools and why they cannot be one, a pack resolving `dist`,
  and where a spec lives are final.
