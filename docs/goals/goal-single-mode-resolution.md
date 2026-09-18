> **Written in session** `36f122d9-3a1e-40ef-988d-40b2574fc098` (Claude Code, 2026-09-17). Resume it with `claude -r 36f122d9-3a1e-40ef-988d-40b2574fc098`.

```
# Goal: one resolution mode for packs

Implement docs/goals/goal-single-mode-resolution.md. Read Background, Rules, Decisions, Phases and
Constraints first. Every decision is settled — none is left for you to make — so where a detail isn't
specified, pick the conventional option, note it in the final summary, and keep going.

This branch (`AS/package-resolution`) already holds the hardened build infrastructure: fingerprint +
stamp freshness, `noEmitOnError`, `runPackageBuild`, `withBuildLock`, the `PACKED_PACKAGES`/`BUILD_UNITS`
split and the rewritten `findMissingSourceConditions`. The other branch, `single-mode/phase-1`, holds the
deletions that remove the dual mode for packs — but rebuilt that same infrastructure at an earlier stage,
so its versions of those files are drafts, not improvements. **Apply the deletions on top of this branch's
infrastructure and fix what the review found; take none of the other branch's build scripts.**

Finished when:
- Phases 1–6 are implemented and each meets its "Done when"; every new guard or test is mutation-checked.
- No pack config, template or scaffold declares `@abuddy/source`, enforced by the Phase 2 guard rather
  than by grepping once.
- `npm run typecheck`, `schema:check`, `api:check` (ears, sdk, ui), `packages:build` + `packages:check`,
  `npm run compile`, `facade:check -w @app/default-setup` and `npm run test:unit` pass.
- `npm start`, `npm run build`, the monorepo E2E (`npm test`), `npm run test:external-pack` and
  `npm run test:packaged-authoring` pass — these are the paths the review found broken, so a green
  unit suite is not evidence.
- A final summary: phase → done, evidence, conventional choices.

Never:
- commit, stage, push or tag unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows.
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; run bare tsc on packages/preload; edit version/release metadata.
- add a compatibility shim for a removed export. A break gets a changeset that names it and the one-line
  fix, never a re-export that keeps the old name alive.
- report a phase green on a unit suite alone when that phase touches a build or launch path.
```

## Background

`@abuddy/ears`, `@abuddy/sdk` and `@abuddy/ui` publish an `@abuddy/source` export condition, so a consumer
can resolve either their TypeScript source or their built `dist`. Deciding *which* was left to inference,
and every dual-mode defect found in review came from that inference rather than from the condition itself:

- `sourceConditions()` read one package's install layout and applied the answer to all three. A linked SDK
  with a published `@abuddy/ui` resolved `ui` to `src/…` paths its tarball doesn't contain; the reverse
  silently compiled a linked UI's stale `dist`.
- `@abuddy/testing/vitest` carried a second copy of the same heuristic, so a pack's tests could resolve
  differently from its build.
- The api-extractor tsconfigs resolved dependencies as source, which produced `ae-wrong-input-file-type`
  and a wave of spurious "forgotten export" notes that went unnoticed for months.
- The root `vitest.config.ts` had an inline project with no config file, so it loaded two `@abuddy/sdk`
  instances: a runtime bound in one was invisible to the other (18 tests failed that way).
- `abuddy dev` never declared the condition at all, so in a checkout it served `dist` while `abuddy build`
  compiled source.

Two measurements settle the direction. Under the condition, `@abuddy/sdk`'s program pulls in 22
`@abuddy/ears` **source** files; with dist resolution and a project reference it reads 21 declaration files
and zero sources — so the condition is what blocks `tsc -b`, not the reverse. And removing it from pack
tooling made the repo faster, not slower: `typecheck` 71s → 48s, `compile` 56s → 14s.

It was also hiding a correctness bug. `@abuddy/sdk/actions` is inlined into every compiled action, so the
same pack built in a checkout and from installed packages produced different compiled seed bytes and
different `sourceHash`/`rowSha256` values — and the host decides whether to re-seed from those hashes.

**What the two branches are.** `AS/package-resolution` keeps the dual mode and hardens it: per-package
detection, an `ABUDDY_PACKAGES=source|dist` declaration, a `check:specifiers` rule that every config
compiling workspace source declares the condition, content-fingerprint freshness with a success stamp,
`noEmitOnError`, build locks. `single-mode/phase-1` removes the dual mode for packs: `sourceConditions()`
and its seven call sites deleted, packs always resolve `dist`. Its base (`spike-baseline`) is
`f317e495d` plus roughly the first half of the other branch's work captured while uncommitted, so its
commit is partly that work being deleted again, and none of the second half reached it.

## Rules

1. **A pack resolves one layout: the published `dist`.** Built-in (`packages/default-setup`), fixture
   (`tests/fixtures/*`) and external packs are the same case. No pack config, scaffold or template declares
   `@abuddy/source`, and nothing infers a mode from an install.
2. **The repo declares the condition for its own code, in its own configs.** Compiling the app (renderer,
   api, main, the `@abuddy/*` packages themselves) may read source; that is stated in each config, never
   derived.
3. **A path that consumes `dist` ensures `dist` first.** Every entry point, not just the npm scripts:
   an entry the CLI owns (`abuddy build`, `abuddy test`, `abuddy dev`) is as much a consumer as `npm test`.
4. **A removed export gets a changeset, not a shim.**
5. **Freshness is a content fingerprint plus a success stamp, never an mtime comparison.**

## Decisions

- **Single mode for packs wins.** The direction is settled by the measurements above; the review found no
  evidence against it. The work is to land it on finished infrastructure rather than on a spike's.
- **The mechanical work stays as this branch has it.** `noEmitOnError`, `runPackageBuild`, the
  `bundle-package.ts` `main()` refactor, `withBuildLock`, `fingerprintInputs`/`stampedBuild`,
  `package-freshness.spec.ts`, the `PACKED_PACKAGES`/`BUILD_UNITS` split and the rewritten
  `findMissingSourceConditions` engine. None of it depends on which resolution model wins, and
  `single-mode/phase-1`'s versions of those same files are earlier drafts — its `ensure-packages-built.ts`
  compares mtimes, which reads an interrupted build as fresh forever.
- **The guard is inverted, not deleted.** `findMissingSourceConditions` keeps the hardened engine and
  changes its verdict: a *pack* config that declares the condition fails; every other config that compiles
  workspace source and doesn't declare it fails; the `RESOLVES_DIST_BY_DESIGN` exception table stays.
- **Secret redaction stays a bound resource.** `HostRuntime.redaction`, installed by `bindHost`, cleared by
  `unbindHost`, with the values living in `@abuddy/host`'s secrets store. Already implemented on
  `single-mode/phase-1`, mutation-checked, and independent of the resolution model — it can land first.
- **`ABUDDY_PACKAGES` goes.** It is a global process switch saying what the configs already say, read in
  five places (`sourceConditions`, `assertSourceResolution` at `source-resolution.ts:40`,
  `scripts/with-source.mjs`, `bin/source-hooks.mjs`, and `docs/public-facing/cli.md`). Under single mode
  nothing infers a mode, so it has no pack-facing purpose left. The capability people reach for it for —
  "build this the way a consumer would" — already exists in a better form: `installPublishedPackages()`
  (`packages/abuddy-cli/tests/helpers/published-packages.ts`) builds a temp `node_modules` with the three
  packages npm-packed and installed exactly as a pack gets them, and seven specs use it. A hermetic fixture
  beats a global switch: it is reproducible, it runs in CI, and it cannot half-apply. If an ad-hoc switch is
  ever wanted back, it belongs in a `tsconfig.dist.json` plus a named script, not an environment variable.
- **The determinism spec changes what it compares.** `types-bundler-determinism.spec.ts` builds the same
  facade twice, from source and from installed `dist`, and asserts they are identical. Under single mode
  both sides resolve `dist` and the spec compares a thing with itself, so it is re-pointed at the question
  that is still live: **the workspace install versus the packed tarball**. That differential catches
  packaging faults the old one never could — `@abuddy/testing`'s tarball carries 10 `src` files and no
  `dist` (it is `private` with no `files` field while its exports point into `dist/package/dist/`), which a
  workspace-vs-tarball comparison fails on immediately.
- **`@abuddy/testing`'s `types` moves to the built declarations.** Today `types` resolves
  `./src/index.ts` while `default` resolves the bundle, so a pack type-checks source and runs a bundle —
  the same split this goal removes everywhere else. It is also why `typecheck:pack` pulls 98
  `@abuddy/host` source files into default-setup's program, though the root `CLAUDE.md` says a pack does
  not depend on host. Declaration quality is not a reason to hesitate: the bundled `.d.ts` are 120 lines
  with their JSDoc intact, real generics (`mockService<S extends object, K extends keyof S & string>`),
  no `any`, and no mention of `@abuddy/host`. The repo's own code is unaffected, since it sets the
  condition and keeps resolving source. The cost is that a `@abuddy/testing` or `@abuddy/host` edit needs
  a rebuild before a pack's typecheck sees it — which is what a consumer experiences anyway, and what
  Phase 1's freshness covers on every npm path.
- **Project references are a separate goal.** They become possible once nothing needs the condition, but
  they need `@abuddy/host` to gain a build and every package to go `composite`. Not this goal.

## Phases

### Phase 1 — the mechanical baseline (already on this branch; confirm, don't rebuild)
Every item below is present as of this doc's writing. Confirm each still holds before Phase 2, because the
later phases lean on it, and re-add anything that went missing:
- `noEmitOnError` in `packages/abuddy-{ears,sdk,ui}/tsconfig.package.json`, so a type error can't leave a
  half-written `dist` that reads as built.
- `runPackageBuild` in the three `scripts/build-package.ts`, and the `scripts/bundle-package.ts` refactor
  that moves top-level statements (including `fs.rmSync(outDir)`) into `async function main()`.
- `scripts/ensure-packages-built.ts` on fingerprint + stamp (`BUILD_UNITS`, `fingerprintInputs`,
  `stampedBuild`, `withBuildLock`), with `packages/abuddy-cli/tests/build/package-freshness.spec.ts`.
- The `PACKED_PACKAGES` / `BUILD_UNITS` split: the packages a consumer fixture installs and the packages
  watched for staleness are different lists. Merging them makes
  `tests/helpers/published-packages.ts` pack `@abuddy/testing` — whose tarball carries 10 `src` files and
  no `dist`, because it is `private` with no `files` field — into seven specs' fixtures.
- The rewritten `findMissingSourceConditions` (config-scope analysis via
  `ts.getParsedCommandLineOfConfigFile`, AST reading of the real `conditions` option, unreadable-verdict
  reporting, symlink-safe walking, per-run caches).
- **Done when:** `npm test -w @abuddy/cli` passes, `package-freshness.spec.ts` still covers the interrupted
  build, the deleted source and the future-dated source, and no consumer fixture installs `@abuddy/testing`.

### Phase 2 — remove the inference
- Delete `packages/abuddy-sdk/src/build/source-conditions.ts`, its `./build/source-conditions` package
  export, `etc/build.source-conditions.api.md`, the `@abuddy/sdk/build` re-export and the
  `shared-modules.ts` bridge entry (`npm run shared-modules:update -w @abuddy/host`).
- Drop the seven call sites: `facade-gate.ts`, `types-bundler.ts`, `fe-bundler.ts` (two),
  `seed-runtime-check.ts`, `module-exports.ts`, `compile-utils.ts`. Each resolves `dist` with no conditions.
- Delete the `sourceConditions` re-export from `@abuddy/testing/src/vitest.ts` and every caller, and remove
  `customConditions`/`resolve.conditions` from `packages/default-setup` and both `tests/fixtures/*` packs.
- Invert the guard's verdict per Decisions, and delete `CONDITION_HELPER`'s `sourceConditions` branch only
  if nothing else uses it (today the whole helper branch matches nothing — check before keeping it).
- Remove `ABUDDY_PACKAGES` and its five readers: `PACKAGES_MODE_ENV`/`declaredMode()` in
  `source-conditions.ts`, the early return at `packages/abuddy-host/src/build/source-resolution.ts:40`, the
  `=== 'dist'` branch in `scripts/with-source.mjs`, the early-out in `packages/abuddy-cli/bin/source-hooks.mjs`,
  and the paragraph in `docs/public-facing/cli.md`. Their specs go with them.
- Point `@abuddy/testing`'s `.` and `./harness` `types` at `./dist/package/dist/{index,harness}.d.ts`, so a
  pack type-checks the declarations it runs against, and order the condition keys the same way on all three
  entries (`.` and `./harness` list `@abuddy/source` first, `./vitest` lists it second).
- Re-point `packages/abuddy-cli/tests/build/types-bundler-determinism.spec.ts` from "source vs installed
  dist" to **workspace install vs packed tarball**: keep `installPublishedPackages()` for one side, use the
  monorepo's own `node_modules` for the other, and drop the two `sourceConditions` assertions that proved
  the builds resolved differently. Name it for what it now checks — that what the repo builds equals what a
  consumer installs.
- **Done when:** `check:specifiers` fails a pack config that declares the condition and a host config that
  omits it, both mutation-checked; nothing in the tree reads `ABUDDY_PACKAGES`; the determinism spec fails
  when a package's `files`/`exports` would ship a tarball that doesn't match the workspace build (verify by
  mutating one, e.g. removing `dist` from a `files` field); and `typecheck:pack` no longer loads any
  `@abuddy/host` source file (`vue-tsc -p packages/default-setup/tsconfig.json --explainFiles | grep -c
  abuddy-host/src` returns 0, against 98 today).

### Phase 3 — fix what the review found
Each of these is a verified defect, with the reproduction in the review:
- **`abuddy build` fails when `NODE_OPTIONS` carries the condition** (`seed-runtime-check.ts:62-69`): the
  child inherits it with no loader. Strip it with `withoutSourceCondition`, as `abuddy test` already does.
  This breaks the documented `PACK_DIR=… npm test` flow and fails as "seed runtime bundle failed", blaming
  the pack.
- **`npm start` and `npm run build` consume `dist` without ensuring it**: wire `packages:ensure` into
  `prebuild:be:dev` and `build` (`compile`, `typecheck:pack`, `test:external-pack` and default-setup's
  `pretest` already have it).
- **`fe.bundleUi` packs lose every Tailwind class when `@abuddy/ui/dist` is missing** (`fe-bundler.ts:63-71`):
  `uiTailwindContent` fails only when the package can't resolve, not when its `dist` globs nothing. Make the
  empty-glob case a build failure, as its own comment already claims.
- **`abuddy test` and `abuddy dev` never ensure freshness** though they load the harness bundle, which
  inlines `@abuddy/host`. Per rule 3, an entry point is a consumer.
- **Done when:** each defect has a test that fails without the fix; `npm start`, `npm run build` and a
  `PACK_DIR=… npm test` run all pass from a clean `dist`.

### Phase 4 — restore the invariants that lost their guards
- **"A pack cannot install its own secret-value matcher."** It used to hold because the module was exported
  only under the condition; now it holds only because `setSecretValueMatcher` isn't re-exported. Add a spec
  that asserts it is absent from `@abuddy/sdk/utils`, `/utils/pure` and the bridge.
- **"`@abuddy/testing` resolves the layout it expects."** The three diagnostic modules were deleted; an
  external pack now gets `ERR_MODULE_NOT_FOUND` or a silently stale bundle. Give the entry a check that
  names the fix, reachable from a pack repo (which cannot run `packages:ensure`).
- **Done when:** both are mutation-checked, and the second is verified from a pack directory outside the
  monorepo.

### Phase 5 — contracts and documentation
- **`abuddy init` stops scaffolding the condition** (`init.ts:67`, with its now-false comment at `:65-66`).
  This is the one pack config the guard structurally cannot see, and it currently reinstates the dual mode
  in every newly scaffolded pack.
- **A changeset for the break**: `@abuddy/testing/vitest` no longer exports `sourceConditions`, so a pack
  scaffolded by an older CLI fails at config load. Name the error and the one-line fix. Note too that
  `@abuddy/sdk/testing` now references `vue` and `@tiptap/*` types through `FeTestRuntimeOptions`.
- **Document the new exports** where a pack author looks: `startFeTestRuntime`/`stopFeTestRuntime` and
  `registeredSeedKeys` in `docs/public-facing/testing.md` and `packages/abuddy-sdk/CLAUDE.md`'s Testing
  entry section.
- **Fix the stale text**: `docs/public-facing/getting-started.md:24`, `docs/public-facing/testing.md:19`,
  `packages/abuddy-host/CLAUDE.md:175`, `packages/abuddy-cli/CLAUDE.md:81` and `:99`,
  `packages/abuddy-cli/bin/abuddy.mjs:33`, the `HostRuntime` member lists in `CLAUDE.md:124` and
  `packages/abuddy-sdk/CLAUDE.md:34` (both omit `redaction`), and `CLAUDE.md:141`, which over-claims: the
  app's own builds still compile default-setup from SDK source (`renderer/vite.config.ts`,
  `api/tsup.config.ts`), so the claim belongs to a pack's own build and tests.
- **Done when:** a pack scaffolded by `abuddy init` passes `check:specifiers`' pack rule, and no
  documentation names a deleted export.

### Phase 6 — verify the paths a unit suite doesn't reach
- `npm start` from a clean `dist`; `npm run build`; `npm test` (monorepo E2E); `npm run test:external-pack`;
  `npm run test:packaged-authoring`; `abuddy test` in a linked pack.
- **Done when:** each passes, with the command and its output in the summary. The review's two
  highest-severity defects lived in exactly these paths while every unit suite was green, so this phase is
  the evidence, not a formality.

## Constraints

- The built-in pack compiles **both ways** and that is correct: `abuddy build` and its own tests resolve
  `dist`, while the renderer's Vite config and the API's tsup config compile its frontend and backend from
  source as part of the app. Don't "fix" the second case.
- `@abuddy/host` has no `dist` and is consumed as TypeScript source by the api, main, the CLI,
  `@abuddy/testing` and the renderer. Single mode for packs does not change that, and the CLI's resolve
  hooks (`bin/source-hooks.mjs`) stay: the CLI is host code, and host source imports
  `@abuddy/sdk/runtime/internals`, which is source-only. Deleting those hooks needs that entry to stop being
  source-only first — a separate decision, not this goal's work.
- Seed goldens: `packages/default-setup/tests/unit/seed-parity/__golden__/default-setup.json` is now
  sensitive to the SDK's `dist` output, because compiled actions inline `@abuddy/sdk/actions`. A bundler or
  tsc change can churn it; re-record with `UPDATE_SEED_GOLDEN=1` and say so in the summary rather than
  editing hashes by hand.
- Don't take `single-mode/phase-1`'s `scripts/ensure-packages-built.ts`, its `PACKAGE_DIRS` merge, or its
  copy of `findMissingSourceConditions`. They are earlier drafts of Phase 1's files.
