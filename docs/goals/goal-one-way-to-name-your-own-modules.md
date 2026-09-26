# Goal: one way for a pack to name its own modules

> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-26). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: one way for a pack to name its own modules

Implement docs/goals/goal-one-way-to-name-your-own-modules.md on AS/test-pipeline, at or after 0ce94ab27 —
the base its Background was surveyed and spiked at.
Before Phase 1, confirm the base: `grep -rho "from '@/" packages/default-setup/src | wc -l` reports 667,
and `packages/default-setup/tsconfig.json` maps both `@/__generated__/*` and `#generated/*` to
`./src/__generated__/*`. If either is already false, stop and say so — the survey was taken somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. The two Open decisions must be settled with the user before Phase 2; if either
is still marked open, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — it is a standing
rule, not this goal's choice): change signatures, move modules, migrate every in-repo caller, test,
fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard is mutation-checked.
- No `@/` specifier remains in any pack's source or tests, and a check refuses a new one.
- One mechanism resolves a pack's own module names, and the configs that each re-implemented it are gone.
- Every suite's spec count and pass count is unchanged, shown before and after.
- npm run typecheck; npm run spec-cost:check; npm test -w @app/default-setup; npm run build; npm test;
  npm run test:external-pack; npm run test:packaged-authoring; npm run chain once at the end.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.
- The doc is in `docs/archive/goals/`, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Rewrite imports with a script, and keep the script in the commit message rather than the tree: 824
  edits reviewed as a diff need the rule that produced them stated.
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
- change `moduleResolution` from `bundler`, in any pack or in the scaffold. The spikes below rest on it.
```

## Background (surveyed 2026-09-26 at `0ce94ab27`)

A pack has two ways to name its own modules, and they are not equivalent.

**`#generated/*` is a Node standard.** The package declares it in its own `package.json`:

```json
"imports": { "#generated/*": "./src/__generated__/*" }
```

Node resolves it. So do Vite and esbuild, with no configuration, because it is part of the module
specification. It is scoped to the declaring package by construction: a `#` name means nothing outside it.

**`@/features/*` is a TypeScript-only invention.** `compilerOptions.paths` tells `tsc` what a name means and
no runtime reads it, so every tool that compiles that code has to be taught the same rule again. Worse, `@/`
here is not a static alias but a *per-importer* rule — `packages/renderer/vite.config.ts:20` says so:

> `@/` — scoped to the importer's pack (or `renderer/src/` for renderer files)

Which is why it cannot be an alias map and needs a resolver plugin everywhere.

### Four implementations of one idea

| Where | How |
|---|---|
| `packages/renderer/vite.config.ts:49` | a Rollup `resolveId` hook that finds the importer's pack |
| `packages/api/tsup.config.ts:79` | an esbuild plugin, `resolve-at-aliases`, doing the same thing again |
| `packages/default-setup/vitest.config.ts` | `vite-tsconfig-paths` |
| `abuddy-cli/src/build/tsconfig-aliases.ts` + `makeAliasPlugin` | reads the pack's tsconfig itself |

That is the direct cause of a day's worth of defects: the fourth had two copies that disagreed, each having
missed a fix the other received (`c9033ebd7`), and the FE/BE asymmetry and the `vite-tsconfig-paths`
`loose: true` question both exist only because `@/` must be re-taught per tool.

### The usage is lopsided, and the built-in pack is the outlier

| | `@/` | `#…` |
|---|---|---|
| `packages/default-setup` | **667** src, 157 tests | 5 |
| `tests/fixtures/external-pack` | **0** | 10 |
| `tests/fixtures/bundled-ui-pack` | 0 | 0 |

Every pack but the built-in one already uses the standard. And default-setup declares **both names for one
directory** — `@/__generated__/*` and `#generated/*` both map to `./src/__generated__/*`, with
`package.json` `imports` already declaring the second, so it works natively today.

By prefix, and this is the shape of the work:

| | src | tests | |
|---|---|---|---|
| `@/__generated__` | 461 | 86 | **a rename to a name that already exists and already resolves** |
| `@/features` | 185 | 54 | needs a new `imports` entry |
| `@/extensions` | 7 | 17 | |
| `@/app-settings` | 14 | 0 | |

**547 of the 824 are `@/__generated__` → `#generated`.** That part removes the two-names-for-one-place
duplication and needs no new declaration anywhere.

### What the spikes measured, 2026-09-26

Each in an isolated fixture: an app whose graph reaches a *linked package's source* which itself uses `#`.

| Tool | `#feat/thing.js` | `#feat/thing` (extensionless) |
|---|---|---|
| Vite 7.0.6 | ✅ | ✅ |
| esbuild 0.25.12 | ✅ | ❌ `Could not resolve` — it names the file and refuses the path |
| `tsc`, `moduleResolution: bundler`, **with** the tsconfig `paths` mirror | ✅ | ✅ |
| `tsc`, `moduleResolution: bundler`, **without** the mirror | — | ❌ `TS2307` |

Three things follow, and none of them was obvious:

1. **Vite needs nothing.** It applied the pack's own `imports` from inside another package's build graph,
   extensionless included. So the renderer's hook, default-setup's `vite-tsconfig-paths` and the CLI's FE
   bundler all need no replacement.
2. **esbuild needs the extension supplied**, as Node's resolver does. So the api's plugin is *replaced* by a
   smaller one rather than deleted — and that code already exists, correct and specced, as
   `resolveWithExtensions` in `abuddy-cli/src/build/subpath-imports.ts` (`0ce94ab27`).
3. **The tsconfig `paths` mirror is not redundant.** Under `bundler` resolution `tsc` will not resolve `#`
   from `package.json` `imports` alone; the scaffold's comment at `init.ts:73` says exactly this and is
   right. Two declarations of one mapping stay, in every pack, by necessity.

## Decisions

Final.

1. **`#` subpath imports are the one way a pack names its own modules.** `@/` goes from every pack's source
   and tests. It is a TypeScript-only mechanism that four bundler configs re-implement, and the standard one
   gives the same per-importer scoping for free because Node resolves `#` against the importing file's
   nearest `package.json`.
2. **`@/__generated__` becomes `#generated`, which already exists.** One name per file. This is its own phase
   because it is 547 of the 824 edits, needs no new declaration, and is provably safe on its own.
3. **The tsconfig `paths` mirror stays**, in default-setup and in the scaffold, because `tsc` under `bundler`
   requires it (spiked). A pack therefore declares each mapping twice, and the scaffold's comment explaining
   why is kept and pointed at from `default-setup/CLAUDE.md`.
4. **`resolveWithExtensions` moves to `@abuddy/host/build/`**, because `packages/api` does not depend on
   `@abuddy/cli` and both depend on host, and it needs only `node:fs` and `node:path` — no new dependency
   anywhere. The api's `resolve-at-aliases` plugin is replaced by a `#`-extension plugin over it, and the
   CLI's BE bundler calls the same function.

   **Skip the move if [`goal-pack-imports-name-the-file.md`](goal-pack-imports-name-the-file.md) is also
   planned.** That goal has pack code write its extensions, after which nothing needs the function at all and
   it is deleted rather than moved — measured, `.ts` and `.js` specifiers resolve in `tsc`, Vite and esbuild
   alike, and only the extensionless form has to be taught. Move it only if this goal runs alone.
5. **A check refuses a new `@/`** in a pack's source or tests (`check:specifiers`). Without it this reverts
   one import at a time, and 824 edits are not something to do twice.
6. **Nothing about the scaffold's layout changes.** A scaffolded pack already uses `#generated` and nothing
   else; that it needs no edit is the evidence this goal is moving *toward* what the tool generates.

## Open decisions — **settled 2026-09-26**

1. **One `imports` entry per top-level directory**: `#features/*`, `#extensions/*`, `#app-settings/*`, beside
   the `#generated/*` that already exists. It matches the entry that was already there, keeps specifiers
   short, and makes a new top-level directory a deliberate two-line addition. The catch-all `#src/*` was the
   alternative — one line that never needs editing — and it costs four characters on every import and would
   have left `#generated` inconsistent unless that folded in too, re-renaming the 550 Phase 1 had just moved.

2. **Drop the CLI's tsconfig-alias reader.** `#` becomes the only supported way a pack names its own modules,
   and `abuddy-cli/src/build/tsconfig-aliases.ts`, `makeAliasPlugin` and the spec's seven cases go with it —
   about ninety lines. Keeping them would keep a mechanism nothing in the repo exercises, which is exactly how
   its two copies drifted apart unnoticed until 2026-09-26. The cost is real and accepted: a pack that
   declares `compilerOptions.paths` of its own gets no bundler support for it.

## Phases

### Phase 1 — `@/__generated__` becomes `#generated`

The 547 mechanical edits, src and tests, with a script whose rule goes in the commit message. Drop
`@/__generated__/*` from `packages/default-setup/tsconfig.json`; `#generated/*` and its `imports` entry are
already there. No config changes: `#generated` already resolves in every tool.

**Done when:** no `@/__generated__` remains; `npm run typecheck`, `npm test -w @app/default-setup` (87 files,
720 tests), `npm run build` and `npm test` pass unchanged.

### Phase 2 — the other three prefixes

Add the `imports` entries the settled Open decision 1 names, mirrored in `paths`, and rewrite the remaining
277 edits. `packages/default-setup/CLAUDE.md` states the one convention and why the mapping is declared twice.

**Done when:** no `@/` remains in `packages/default-setup`; the same five commands pass unchanged.

### Phase 3 — the configs that re-implemented it

> One line here is shared with [`goal-pack-test-config.md`](../archive/goals/goal-pack-test-config.md), which
> has run: `packages/default-setup/vitest.config.ts` is a `definePackTestConfig()` call that passes
> `tsconfigPaths` beside it, with a comment naming this goal as what removes that. So this phase deletes one
> line and its import from that file, not a plugin from a config it assembles. Nothing else overlaps — the two
> goals' phases name no other file in common.

Delete the `@/` branch from `packages/renderer/vite.config.ts`, and `vite-tsconfig-paths` from
`packages/default-setup/vitest.config.ts` (with its devDependency). Move `resolveWithExtensions` to
`@abuddy/host/build/`, replace `packages/api/tsup.config.ts`'s `resolve-at-aliases` with a `#`-extension
plugin over it, and point the CLI's BE bundler at the same function. Act on Open decision 2 for the CLI's
alias reader.

**Done when:** `npm run build`, `npm test`, `npm run test:external-pack` and `npm run test:packaged-authoring`
pass; no config resolves `@/`; `grep -rn "@/" packages/*/vite.config.ts packages/*/tsup.config.ts` is empty.

### Phase 4 — the guard

`check:specifiers` refuses a `@/` specifier in a pack's source or tests, naming `#` and the pack's own
`imports` as the fix. Mutation: reintroduce one `@/features` import and watch it named.

**Done when:** the check passes, has been made to fail, and `npm run typecheck` is green.

### Phase 5 — the numbers

Record what came out: the four mechanisms reduced to one, the lines deleted, and whether any build got
measurably faster or slower (a resolver hook per import is not free, but neither is it obviously
significant — measure `npm run build:app` before and after rather than claiming either way).

**Done when:** the Outcome carries before-and-after figures rather than an assertion.

## Deferred

- **`@<pack-id>/*`**, the renderer's other namespace alias into each pack's `src/`. It is cross-package, so
  `#` cannot express it — a `#` name is private to its own package, which is the property that makes it
  safe. Whatever replaces it is a different question about how one pack reaches another, and pack code
  already goes through generated facades rather than paths.
- **`moduleResolution: nodenext` and extensioned specifiers**, which would make pack source resolvable by
  Node with no bundler help at all and remove even the esbuild extension plugin. It is a larger change (it
  moves the scaffold too, and `tsc` then *requires* the `.js` form, spiked above), and it is orthogonal:
  this goal is about having one mechanism, that one is about which regime it runs under.

## Constraints

- **Rewrite with a script, review the rule.** 824 edits cannot be reviewed line by line; what can be
  reviewed is the substitution that produced them and the counts before and after. Put the script in the
  commit message.
- **Counts before and after, every phase.** `npm test -w @app/default-setup` is 87 files and 720 tests today.
- **Do not change `moduleResolution`.** Every spike above assumed `bundler`, which both default-setup and the
  scaffold declare. Changing it invalidates the measurements this plan rests on.
- **`.vue` files count.** 667 includes specifiers inside SFC `<script>` blocks; a rewrite that only walks
  `.ts` leaves the pack half-migrated and typechecking green, because `tsc` does not read SFCs (`vue-tsc`
  does).
- **Another agent works in this checkout.** Check `git status` before committing and name paths explicitly.
