> **Written in session** `c9f31de2-e94c-46ea-a2ac-2898390dc27d` (Claude Code, 2026-09-25). Resume it with `claude -r c9f31de2-e94c-46ea-a2ac-2898390dc27d`.

```
# Goal: every workspace is checked for unused code, by the check that already runs

Implement docs/goals/goal-unused-code-gate.md on master, at or after 34da529b7 — the base its
Background was surveyed at.
Before Phase 1, confirm the base: packages/abuddy-host/tsconfig.json, packages/abuddy-sdk/tsconfig.json,
packages/default-setup/package.json and packages/renderer/eslint.config.ts exist at HEAD, and the root
package.json's `lint:check` is still `npm run lint:check -ws --if-present`. If they don't, stop and say
so — the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. The Open decisions must be settled with the user before Phase 3; if any is
still marked open, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — it is a standing
rule, not this goal's choice): change signatures, move modules, migrate every in-repo caller, test,
fixture, template and doc in the same change, and fix forward. Stored user data is the exception: it
moves with migrations.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard is mutation-checked.
- `noUnusedLocals` is on for every workspace that typechecks, and no workspace's typecheck reports
  TS6133 or TS6196.
- A guard fails when a workspace's tsconfig omits `noUnusedLocals`, so a new package can't opt out by
  forgetting.
- `npm run lint:check` covers every workspace that has source, or a guard names the ones it does not
  and why (Decision 4).
- npm run typecheck passes; npm run test:unit passes; the suites of every package whose source this
  changed pass.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.
- The doc is in `docs/archive/goals/`, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A phase
  is landable on its own; a commit is how that stays true. Conventional message, no Co-Authored-By or
  session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload (its tsconfig has no outDir; see packages/preload/CLAUDE.md),
  `npm install` in the example pack, or edit version/release metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- silence a finding with an `_` prefix, an `eslint-disable`, or a `void x` where the right answer is to
  delete the symbol (Decision 3).
- add `noUnusedParameters`: it is a separate, larger change (Deferred).
```

## Background (2026-09-25, at 34da529b7 on master)

An unused import survived in `packages/abuddy-host/src/secrets/index.ts` — `getDesignated` and
`hasDesignation`, left when `forwardSecretsChanges` stopped resolving a designation — and was found by
reading, not by a check. Asking why turned up two independent gaps.

### Only two workspaces are linted

`packages/default-setup` and `packages/renderer` declare `lint:check`. The other eleven do not:

| has `lint:check` | does not |
|---|---|
| `@app/default-setup`, `@app/renderer` | `@abuddy/host`, `@abuddy/sdk`, `@abuddy/ears`, `@abuddy/cli`, `@abuddy/testing`, `@abuddy/ui`, `@app/api`, `@app/main`, `@app/preload`, `@app/electron-versions`, `@app/typescript-floor` |

The root script is `npm run lint:check -ws --if-present` (`package.json`), and `--if-present` makes a
missing script a pass. `lint:check` is the last step of the root `typecheck` chain, so the chain reports
lint as green while covering two of thirteen workspaces.

default-setup's script is `oxlint . -D correctness --ignore-path .gitignore`; renderer has
`eslint.config.ts`. There is no lint config at the repo root and none in any unlinted package.

What oxlint reports today in packages nothing lints (`npx oxlint packages/<p>/src`):

| package | findings | of which `no-unused-vars` |
|---|---|---|
| `@abuddy/host` | 30 | 27 |
| `@abuddy/sdk` | 4 | — |
| `@abuddy/ears` | 2 | — |

`-D correctness` reports the same 30 as a bare run, so the flag default-setup uses is not what hides
them: nothing runs at all. The two linted packages report 0, which is what being linted looks like.

### No workspace sets `noUnusedLocals`

No `tsconfig*.json` in the repo sets it, so the compiler never reports an unused import in any
workspace, linted or not. That is the check that already runs on every package, and it is off.

Measured by overriding the flag on each package's existing tsconfig
(`npx tsc -p packages/<p>/tsconfig.json --noUnusedLocals --noEmit`, counting TS6133 and TS6196;
renderer via `vue-tsc -p tsconfig.app.json`):

| package | unused symbols | package | unused symbols |
|---|---|---|---|
| `@abuddy/host` | 32 | `@app/api` | 17 |
| `@abuddy/testing` | 23 | `@app/default-setup` | 14 |
| `@abuddy/cli` | 11 | `@app/main` | 5 |
| `@abuddy/sdk` | 6 | `@abuddy/ears` | 0 |
| `@app/renderer` | 22 | `@app/preload` | 0 |

**110 across nine packages.** The number that matters most for the design: `@app/default-setup` has
**14 under the compiler while oxlint reports 0**. The two checks do not overlap — `no-unused-vars` and
TS6133 disagree about enough cases that lint alone would not have caught this class even in the
packages that run it.

### Why this is worth a goal rather than a fix

The cleanup is 110 findings across nine packages, each needing a judgement — delete the symbol, or use
it because its absence is the bug. That is the shape the `secrets/index.ts` import had: the import was
dead because a behaviour change had orphaned it, and the honest fix was to delete it. Some of the 110
will instead be a symbol something should be using.

## Decisions

Final.

1. **`noUnusedLocals` is the gate, not lint.** It runs in the check every package already has, needs no
   per-package script or config, and catches 14 cases in default-setup that its lint does not. Lint
   coverage is a separate question (Decision 4).

2. **One phase per package, cleaned before the flag goes on.** Turning the flag on repo-wide first would
   leave the typecheck red for the length of the goal, and a red baseline is where unrelated breakage
   hides. Each phase cleans one package and turns the flag on for that package, so the chain is green at
   every commit.

3. **A finding is deleted, not silenced.** No `_` prefix, no `eslint-disable`, no `void x`. Where a
   symbol is unused because something stopped using it, check whether the *caller* is the bug before
   deleting — that is what the import this goal came from turned out to be. Record any case where the
   answer was to use the symbol rather than remove it: those are defects this goal found, and they
   belong in the Outcome.

4. **Lint coverage is this goal's, but second.** Once the compiler gate is on everywhere, add
   `lint:check` to the workspaces that have source, or a guard listing the ones that legitimately have
   none. Doing it after the compiler gate means the remaining lint findings are the ones the compiler
   does not catch, which is the set worth reading.

5. **A guard, so a new package cannot forget.** A spec over the workspace tsconfigs fails when one that
   typechecks omits `noUnusedLocals`. Without it the gate decays the way lint did: silently, one new
   package at a time.

## Open decisions — **settled 2026-09-25**

1. **`noUnusedLocals` is declared in each workspace's tsconfig**, not in a shared base. The configs stay
   standalone, which is how this repo has deliberately kept them; the flag is repeated thirteen times and
   Decision 5's guard is what catches a new package omitting it.
2. **The whole goal is in scope**, Phases 1–4, not only Phase 4's lint widening. Phase 1 reports what
   `@app/electron-versions` and `@app/typescript-floor` contain before either is included.

Confirmed unimplemented at `9e0eb7891`: `noUnusedLocals` appears in **0** tsconfigs and `lint:check` in
**2** of 13 workspaces — exactly the state the Background describes.

The options as surveyed, kept for the reasoning:

1. **Where `noUnusedLocals` is declared.** The workspaces share no base tsconfig today — each
   `packages/*/tsconfig.json` is standalone.
   - **In each workspace's tsconfig.** No new file, and each package's config stays readable on its own;
     the flag is repeated thirteen times and a new package can omit it, which Decision 5's guard is what
     catches. — *open*
   - **In a new shared base the workspaces extend.** Declared once, inherited; but it is a new file
     every package's config depends on, and the repo has deliberately kept them standalone (`tsconfig`
     comments in `packages/abuddy-ears/tsconfig.json` explain why project references were rejected). — *open*

2. **Whether `@app/electron-versions` and `@app/typescript-floor` are in scope.** Both are tiny and may
   have no source to check; Phase 1 should report what they contain before either is included. — *open*

## Phases

### Phase 1 — The guard, and the packages that are already clean

- Add the spec from Decision 5 over every `packages/*/tsconfig.json`, with the two packages that measure
  0 (`@abuddy/ears`, `@app/preload`) turned on, and every other package listed in the spec as a known
  exemption with its current count.
- Report what `@app/electron-versions` and `@app/typescript-floor` contain (Open decision 2).
- Do not touch `packages/preload` with a bare `tsc`: use `npm run build -w @app/preload`.

**Done when:** `npm run typecheck` passes; the spec passes; the exemption list matches the measured
counts. Mutation: removing `noUnusedLocals` from `@abuddy/ears`'s tsconfig fails the spec, and adding a
package to the exemption list that is already clean fails it too.

### Phase 2 — The small packages

- Clean and enable, in this order: `@abuddy/sdk` (6), `@app/main` (5), `@abuddy/cli` (11).
- Remove each package's entry from the Phase 1 exemption list as it lands.

**Done when:** each package's own typecheck and unit suite pass; the exemption list no longer names
them. `@abuddy/sdk` also needs `npm run api:check` if any removed symbol was exported.

### Phase 3 — The large packages

- Clean and enable: `@app/default-setup` (14), `@app/api` (17), `@app/renderer` (22), `@abuddy/testing`
  (23), `@abuddy/host` (32).
- `@abuddy/testing` is bundled into other packages' test runs, so `npm run packages:build` before the
  suites that read it.
- After Open decision 1 is settled.

**Done when:** `npm run typecheck` and `npm run test:unit` pass; the exemption list is empty; the guard
now asserts every workspace has the flag rather than a list of exceptions.

### Phase 4 — Lint coverage (Decision 4)

- Add `lint:check` to the workspaces with source, matching default-setup's invocation, or a guard naming
  the ones that have none.
- Fix what it then reports, or record it as Deferred with counts if it is another 100-finding cleanup:
  the goal's gate is the compiler, and lint's remaining findings are a separate judgement.

**Done when:** `npm run lint:check` covers every workspace with source and exits 0; a guard fails when a
workspace with source has no lint script.

## Deferred

- **`noUnusedParameters`.** A larger and noisier class (unused `context` in XState actions is the common
  case, and the convention there is an `_` prefix, which Decision 3 forbids for this goal's findings).
  Size it separately.
- **The renderer's eslint config versus oxlint.** Renderer lints with `eslint.config.ts` while
  default-setup uses oxlint; whether they converge is its own question.

## Constraints

- Commit each phase as it finishes, in logical chunks, no attribution lines, `git diff --cached` first;
  pushing, tagging and PRs are on request.
- No publishing, releases or triggered workflows. No real data dirs, no broad pkill.
- No bare `tsc` in `packages/preload`; no `npm install` in the example pack; no version metadata.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- Published packages: no `any` in the pack-facing SDK, the TypeScript floor, `api:update` after export
  changes with `etc/` committed.
- Build order: `packages:build` before the CLI and harness suites; default-setup's runtime before the
  api suites and E2E. Suites don't run concurrently.
- Investigate failing tests; mutation-check new guards.
- External packs are first-class: keep the fixture packs and `test:packaged-authoring` passing.
- Narrow checks during the work (one package's `tsc --noEmit`, one spec file), the full chain once per
  phase at its end — root `CLAUDE.md`, "What to run after a change".
