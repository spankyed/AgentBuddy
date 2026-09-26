# Goal: a pack's import names the file that is there

> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-26). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: a pack's import names the file that is there

Implement docs/goals/goal-pack-imports-name-the-file.md on AS/test-pipeline, after
goal-one-way-to-name-your-own-modules.md — see "Order" below, which explains why that one goes first and
what changes here if it has not run.
Before Phase 1, confirm the base: pack code holds 776 extensionless own-module specifiers in
packages/default-setup and 25 in tests/fixtures/external-pack, and 234 + 41 `.js` specifiers in their
`src/__generated__/`. If those are already false, stop and say so — the survey was taken somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. The Open decision must be settled with the user before Phase 3; if it is still
marked open, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — it is a standing
rule, not this goal's choice): change signatures, move modules, migrate every in-repo caller, test,
fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard is mutation-checked.
- Every specifier in pack code that names one of the pack's own modules ends in the extension that module
  actually has, and a check refuses one that does not.
- One convention covers hand-written pack code, generated pack code and the scaffold, where there were
  three.
- Every suite's spec count and pass count is unchanged, shown before and after.
- npm run typecheck; npm run spec-cost:check; npm test -w @app/default-setup; npm run compile;
  npm run build; npm test; npm run test:external-pack; npm run test:packaged-authoring;
  npm run chain once at the end.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.
- The doc is in `docs/archive/goals/`, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Rewrite specifiers with a script and put the script in the commit message: 800 edits are reviewed by
  the rule that produced them, not line by line.
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
- remove `allowImportingTsExtensions` from a pack tsconfig or the scaffold's. This whole goal rests on it,
  and it is already set in both.
```

## Background (surveyed 2026-09-26 at `15f6ff4c2`)

A specifier in pack code can name its target three ways, and **this repo uses all three at once**:

| Convention | Where | Evidence |
|---|---|---|
| names the `.ts` source | `@abuddy/ears`, `/sdk`, `/host`, `/ui`, `/testing` | root `CLAUDE.md:441`; `check:specifiers` **rejects** a relative `.js` there (`findJsSpecifiers`) |
| names `.js` | generated pack code | 234 specifiers in `default-setup/src/__generated__`, 41 in the fixture's — `from '../features/threads/be/repository/index.js'`, pointing at `.ts` files |
| names nothing | hand-written pack code | 776 in `default-setup`, 25 in `tests/fixtures/external-pack` |

So the repo forbids in its own packages exactly what it generates into its packs, and hand-written pack code
does a third thing. None of that was decided; it accumulated.

### What each form costs, measured

Spiked 2026-09-26 in isolated fixtures — an app whose graph reaches a linked package's source that uses a
`#` subpath import, plus `tsc` over the package itself:

| Form | `tsc` (`bundler`) | Vite 7.0.6 | esbuild 0.25.12 |
|---|---|---|---|
| `#feat/thing` | ✅ *only with the tsconfig `paths` mirror* | ✅ | ❌ `Could not resolve` |
| `#feat/thing.js` | ✅ | ✅ | ✅ |
| `#feat/thing.ts` | ✅ | ✅ | ✅ |

**Extensionless is the only form a tool has to be taught**, and esbuild is the tool. That teaching is
`resolveWithExtensions` in `abuddy-cli/src/build/subpath-imports.ts` — which is also where four defects were
found and fixed on 2026-09-26 (`0ce94ab27`), all of them in code whose only job is guessing a suffix the
author could have written.

`.ts` and `.js` are equivalent to every tool. What separates them is that **`.ts` is the file that is
there.** `.js` names a file that does not exist and works because `tsc`, Vite and esbuild each perform a
`.js` → `.ts` substitution; it is the right form for code emitted as individual JavaScript files, which is
why generated code chose it, and a pack is never emitted that way — it ships as `dist/runtime/index.cjs` and
`dist/runtime/fe.js`.

### The premise is already in place

`allowImportingTsExtensions: true` is set in `packages/default-setup/tsconfig.json` **and** in the scaffold
(`abuddy-cli/src/commands/init.ts`, `PACK_TSCONFIG`), where its comment reads: *"A pack typechecks the
@abuddy packages' published declarations … Their declarations name .ts files."* The reason is recorded; only
the pack's own imports have not followed it.

## Order

**Run [`goal-one-way-to-name-your-own-modules.md`](../archive/goals/goal-one-way-to-name-your-own-modules.md) first.** That one
changes a specifier's *prefix* (`@/features/x` → `#features/x`, four resolver mechanisms down to one); this
one changes its *suffix*. They touch overlapping sets of specifiers, so each is one script pass and the order
is not load-bearing — but the suffix rule and its guard are much simpler to state against one prefix than two.

Two things depend on that goal having run:

- **`resolveWithExtensions` need not move to `@abuddy/host/build/`.** That goal's Decision 4 moves it so
  `packages/api` and `@abuddy/cli` can share it. If this goal runs after, nothing needs it at all and it is
  deleted instead — so if both are planned, skip the move and delete it here.
- **`packages/api`'s `resolve-at-aliases` plugin** is deleted by that goal, not this one.

If this goal runs *first* instead, nothing breaks; it simply deletes nothing, because the `@/` resolvers
resolve extensionlessly and `resolveWithExtensions` still serves them.

## Decisions

Final.

1. **A specifier names the file that is there: `.ts` for a TypeScript module, `.vue` for an SFC.** Not `.js`,
   which names a file that does not exist, and not nothing, which makes a tool guess.
2. **One convention across all three populations** — hand-written pack code, generated pack code, and the
   scaffold's templates. Three conventions in one repo is the finding this goal exists for; replacing three
   with two would not be worth 800 edits.
3. **`generate-entries` emits `.ts`.** Its spec pins the emitted form in several places
   (`abuddy-sdk/tests/build/generate-entries.spec.ts:97`, `:297`, `:325`, `:427`), which is the right
   coupling: those expectations move with the change rather than being loosened.
4. **The check is the existing one, widened.** `check:specifiers` already has `findJsSpecifiers`, which
   rejects a relative `.js` specifier that names a TypeScript module in the `@abuddy` packages. Pack sources
   join its scope, and a companion refuses an *extensionless* own-module specifier. One mechanism, one place.
5. **The extension-supplying machinery goes when nothing needs it.** `resolveWithExtensions` and the
   subpath plugin's suffix-guessing exist only for extensionless specifiers. Deleting them is the point of
   the exercise, not a side effect — code whose only job is guessing what the author could have said.

## Open decision — settle before Phase 3

**Does a *third-party* pack have to write extensions too?**

Phase 3 widens `check:specifiers` over the packs in this repo, and `abuddy build` is what a pack outside it
runs.

- **Require it, and have `abuddy build` say so.** One convention for every pack, the machinery goes, and a
  pack author gets a clear message naming the suffix instead of a resolution error. Costs: a pack author who
  copies an extensionless import from anywhere else in the JavaScript world hits it, and `abuddy build`
  grows a diagnostic it did not need.
- **Allow it, and keep the suffix-guessing for external packs only.** Kindest to an author's habits. Costs:
  the machinery stays, the built-in pack is checked by a rule external packs are not, and the reason lives
  only in a comment — which is how the two copies of the tsconfig reader drifted unnoticed.

Nothing about breaking anyone bears on this: no pack exists outside this repo (root `CLAUDE.md`, *Backward
compatibility*). It is a question about the surface we want to support.

## Phases

### Phase 1 — a spike, because one population is not covered by the measurements

`vue-tsc` checks default-setup's SFCs, and the table above measured `tsc`. Confirm that `vue-tsc` accepts a
`.ts` specifier inside a `<script setup>` block, and that the renderer's Vite build resolves one from an SFC
in a pack it compiles. Both should hold — same compiler options, same resolver — but "should" is not a
measurement, and 800 edits are a poor way to find out.

**Done when:** the two results are recorded in this doc. If either fails, stop: the goal needs rethinking for
SFCs and that is worth knowing before Phase 2, not during it.

**Both hold, measured 2026-09-26 on the real tree rather than a fixture** — one specifier inside
`packages/default-setup/src/features/database/fe/settings.vue` changed to `from '#generated/types.ts'`, then
reverted:

| Check | Result |
|---|---|
| `vue-tsc` over a `.ts` specifier in `<script setup>` | ✅ `npm run typecheck:pack` passed |
| the renderer's Vite build and the API's esbuild, resolving it from a pack's SFC | ✅ `npm run build:app` exit 0, no errors |

A standalone fixture (`package.json` `imports`, `moduleResolution: bundler`, `allowImportingTsExtensions`, an
SFC importing `#feat/thing.ts`) agreed. So nothing about SFCs needs rethinking, and Phase 2's rewrite must
include them — which the Constraints already say, since `tsc` does not read an SFC and `vue-tsc` does.

### Phase 2 — hand-written pack code

The 801 extensionless specifiers, in `packages/default-setup` (src and tests) and `tests/fixtures/*`, take the
extension of the file they name. A script, with its rule in the commit message. `.vue` targets already carry
theirs.

**Done when:** no extensionless own-module specifier remains in pack code; `npm run typecheck`,
`npm test -w @app/default-setup` (87 files, 720 tests), `npm run compile`, `npm run build`, `npm test` and
`npm run test:external-pack` pass unchanged.

### Phase 3 — generated pack code and the scaffold

`generate-entries` emits `.ts`; its spec's pinned strings move with it. The scaffold's templates
(`init.ts`, `add/feature.ts`, `add/step.ts` and the rest) write extensions. Act on the Open decision for what
`abuddy build` does about an external pack.

**Done when:** `npm run compile` regenerates with `.ts` throughout; `npm run test:packaged-authoring` passes,
which is the one check that authors a pack from the templates outside the monorepo.

### Phase 4 — delete the guessing

`resolveWithExtensions` and the subpath plugin's suffix search go, along with `subpath-imports.spec.ts`'s
cases for them (the `readSubpathImports` half stays — reading `package.json` `imports` is still needed).

**Done when:** `npm run test:external-pack` and `npm run test:packaged-authoring` pass with the machinery
gone, and the deleted line count is recorded.

### Phase 5 — the guard

`findJsSpecifiers`' scope gains the pack sources, and a companion check refuses an extensionless own-module
specifier, naming the file it should have named. Mutation: drop one extension and watch it named; change one
to `.js` and watch that named too.

**Done when:** both checks pass, both have been made to fail, and `npm run chain` is green.

## Deferred

- **`moduleResolution: nodenext`.** With extensions everywhere, a pack's source becomes resolvable by Node
  with no bundler at all, and `nodenext` is what would make `tsc` agree with that. It is a separate question
  about which regime a pack runs under, it moves the scaffold, and `nodenext` *requires* the `.js` form
  (spiked: `.ts` is rejected there) — so it would reverse Decision 1. Worth revisiting only if a pack ever
  needs to run unbundled.
- **`@abuddy/*` packages' own specifiers**, which already name `.ts` and are already checked. Nothing to do.

## Constraints

- **Rewrite with a script; review the rule.** 800 edits cannot be read line by line. The reviewable artefacts
  are the substitution, the before-and-after counts, and the suites.
- **Counts before and after, every phase.** `npm test -w @app/default-setup` is 87 files and 720 tests today.
- **`.vue` files count, in both directions.** Specifiers inside SFC `<script>` blocks need rewriting, and
  `tsc` does not read SFCs — `vue-tsc` does. A rewrite that walks only `.ts` leaves the pack half-migrated
  with a green `typecheck`.
- **Generated files are regenerated, never hand-edited.** The 275 `.js` specifiers under `src/__generated__/`
  change by changing `generate-entries` and running `npm run compile`. A script that rewrites them in place
  is undone by the next build and hides whether the codegen was actually fixed.
- **Don't touch `allowImportingTsExtensions`**, in a pack tsconfig or the scaffold's. It is set in both, and
  every measurement here assumed it.
- **Another agent works in this checkout.** Check `git status` before committing and name paths explicitly.
