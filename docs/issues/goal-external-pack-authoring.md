```
# Goal: External pack authoring for outside authors

Make AgentBuddy packs buildable, releasable, installable and testable by outside
authors who do NOT have the monorepo checked out.

The spec is docs/issues/goal-external-pack-authoring.md (sections Background,
Decisions D1–D7, Phases 0–6, End state, Constraints). Read it first and follow it.
All decisions are final: implement them, don't reopen them or stop to ask. Where
a detail isn't specified, pick the conventional option, note it in the final
summary, and keep going. Some of phase 0 may already exist in the working tree:
verify it and build on it.

Finished when:
- Phases 0–6 are implemented and verified, and the End state script passes
  locally in a temp dir outside the monorepo.
- `npm run typecheck`, `npm run typecheck -w @app/main`, `schema:check` and
  `api:check` pass, plus unit suites for every package touched.
- `npm run test:external-pack`, the monorepo smoke E2E, and the example pack's
  `abuddy test` (8 tests, incl. calendar round-trip and overflow) all pass.
- The postmortem shows each item resolved (with evidence) or open.
- You give me a final summary (incl. conventional choices you made) plus a
  suggested commit message as text.

Never, regardless of the spec:
- push or tag. Commit as you go in logical chunks (conventional commit messages, no Claude Code attribution/Co-Authored-By/session lines); stage only the files each commit covers.
- Publish externally: no `npm publish`, real GitHub releases, or Homebrew pushes
  (use dry runs, `npm pack`, mocked GitHub API). Write CI workflows, don't trigger.
- Broad pkill/killall on Electron or node.
- Launch the app outside the test env without an isolated ABUDDY_USER_DATA_DIR.
- Run bare tsc on packages/preload, or edit monorepo version/release metadata.
- `npm install` in the example pack.
- Loosen a failing assertion instead of investigating; every new guard or test
  gets a mutation check.
```

## Background

- `docs/issues/postmortem-external-pack-calendar-extraction.md` — status of every item, N1–N4, the secondary review table.
- `~/.claude/plans/fix-4-ticklish-crown.md` — secondary findings F4–F11.
- `CLAUDE.md` "App environment": environment identity and data paths come from `@abuddy/sdk/env` (`resolveAppContext`). Never read `NODE_ENV`/`PLAYWRIGHT_TEST` or platform paths to pick a data dir; `packages/abuddy-sdk/tests/env/identity-guard.spec.ts` enforces this.
- In-repo external pack: `tests/fixtures/external-pack`, run with `npm run test:external-pack` (`tests/scripts/test-external-pack.sh`).
- Real external pack: `/Users/spankyed/Develop/Projects/abuddy-external/example-pack` (not a git repo; links `@abuddy/sdk` from the monorepo via npm link).
- CLI bin today: `packages/abuddy-sdk/bin/abuddy.mjs` (node launcher registering tsx).
- Already done, don't redo: CLI no longer needs tsx on PATH (item 2); `abuddy open`; single environment resolver (F3) and `pack-e2e.spec` isolation (F2); month-grid overflow (N5); packaged apps already use the `abuddy` / `abuddy-beta` / `abuddy-test` data dir names.

## Decisions (final)

**D1 — Flows that use a dependency's steps.** `abuddy build` validates with the dependency's real step build code (`validate`/`compile`/`decompile`/`getLabel`), shipped in its release bundle. The host re-validates at seed time. Invalid flows at seed become a visible pack install error and fail `abuddy test` (today `flow-seeder.ts` skips them with `console.warn`). The host publishes its built-in packs' `types/` and `build/` into the app data dir on boot so dependencies resolve without a workspace or registry.

**D2 — Release artifact.** One `<id>-<version>.tgz` per version, plus a `.sha256` asset. Layout:
- `<id>/abuddy.json` — resolved manifest
- `<id>/bundle.json` — formatVersion, sdkVersion, source {repo, commit}, sha256 per file
- `<id>/runtime/` — `index.cjs` (exports `registration`: systems, services, steps, artifacts, blocks, boot, migrations, EARS), `fe.js` + `fe.css` minified, `seeds/*.json`
- `<id>/build/steps.build.mjs` — step build facets only, no FE imports
- `<id>/types/` — `snapshot.json` (includes defs)

Installer: verify checksum, check hostVersion + dependencies, place the bundle. fetch-deps: extract `types/` + `build/`. Host loader reads `runtime/` and refuses unknown formatVersion majors.

**D3 — `abuddy release [patch|minor|major] [--beta] [--dry-run] [--local]`.**
- Preflight: clean tree, default branch, auth, valid manifest, hostVersion, resolvable deps.
- Version bump in `abuddy.json` + `package.json` using the monorepo's beta cycle.
- Verify: `build --release`, typecheck, unit tests, `abuddy test` unless `--skip-e2e`.
- Commit + tag `v<version>` + push.
- Publishing happens in a scaffolded `.github/workflows/release.yml` (on `v*` tags: `build --release`, pack, checksum, GitHub release via the GitHub API, prerelease for beta, artifact attestation). `--local` publishes from the machine instead. Use Octokit, not the gh CLI.

**D4 — `abuddy test` without the monorepo.**
- On first run, prompt for a monorepo path or to download the latest beta app build; store the choice in user config (platform config dir).
- CI never prompts: flags/env (`--app-root`, `--app beta`, `ABUDDY_ROOT`) or a clear failure.
- Downloads pick the newest beta satisfying the pack's hostVersion, verify checksums, cache by version.
- `build/release/release.sh` enforces: a production release must have a beta tag for the same version, or it also publishes that build as the current beta.

**D5 — Packages published to npm.** (Updated by `docs/issues/goal-sdk-types-architecture.md`.)
- `@abuddy/sdk`: pack-facing platform API and types (no bin). ESM, per-file `.d.ts` and declaration maps emitted by `tsc` from sources with explicit `.js` specifiers. Host-only modules (pack registry, installer, persistence, backups, FE registration, build-time discovery) live in the private workspace package `@abuddy/host`, which the app, CLI and testing bundles inline; the published SDK neither ships nor exports them.
- Pack typing comes from facades each pack generates (`#generated/ears`, `#generated/events`, `#generated/services`, `#generated/types`), typed against the pack's and its dependencies' entity shapes, events and services. There is no module augmentation of `@abuddy/sdk`.
- `@abuddy/ui`: the Vue component library (design components, tiptap and Monaco editors, UI composables) with vue-tsc declarations (`X.d.vue.ts`) and an explicit exports map. Its editor libraries are its own dependencies, so backend-only packs don't install them.
- `@abuddy/cli`: the only `abuddy` bin, the build toolchain (vite, esbuild, tailwind, codegen) and commands; depends on `@abuddy/sdk`. Packs pin it as a devDependency. A globally installed, Homebrew or app-bundled `abuddy` hands off to the project's pinned `@abuddy/cli` when run inside a pack.
- `@abuddy/testing`: the Playwright fixture, with `@playwright/test` as a peer.
- Host-shared libraries (xstate, vue, @xstate/vue, lucide-vue-next, reka-ui, zod, tiptap) are peerDependencies with host ranges.
- Versioned together with Changesets; published from CI with `npm publish --provenance`.
- `@abuddy/sdk` and `@abuddy/ui` publish their workspace `package.json` as is. Each export resolves source under the `@abuddy/source` condition, which monorepo tooling sets, and `dist/` otherwise, so dev needs no build step. CI runs publint, arethetypeswrong, API Extractor reports for every entry and a consumer typecheck matrix (bundler and node16) against the packed packages.

**D6 — CLI distribution.** The installed app bundles `@abuddy/cli` and puts it on PATH only through an explicit app action ("Install 'abuddy' command in PATH", like VS Code). Also installable via `npm i -g @abuddy/cli` and a Homebrew formula.

**D7 — IDs.** Feature IDs must be identifiers (`^[a-z][a-zA-Z0-9]*$`); pack IDs stay kebab-case.

## Phases

**Phase 0 — release artifact and pipeline (D2, D3).**
- `abuddy build` emits `runtime/index.cjs` and `build/steps.build.mjs`. Split default-setup's step definitions into build-only entry points (schedule already has `build.ts`; others import their fe modules). Confirm the loader loads an external pack's services/steps/boot/migrations (previously `dist/index.js` was never produced).
- `abuddy pack` bundle layout + `bundle.json` + checksums; installer, fetch-deps and pack-updater (semver + channel aware, respects hostVersion) consume it; the in-app `INSTALL_PACK` flow uses the same installer.
- `abuddy release` + scaffolded release workflow + `--local`.

**Phase 1 — the scaffold works.**
- D7 in the manifest schema (regenerate `abuddy.schema.json`, `schema:check` green) and `abuddy add feature`.
- `abuddy init` template: no unresolvable `"default-setup": "*"` dependency, and no example flow that can't compile; an unresolvable dependency is a hard build error. Once D1 lands, the template may depend on default-setup and include a keepAlive flow again, resolved from the host.
- SDK/CLI unit test: init → add feature → build → `tsc --noEmit` → pack in a temp dir outside the monorepo, no Electron; mutation-check it.

**Phase 2 — D1.** Dependency step validation, loud seed failures, host-published built-in snapshots and build facets.

**Phase 3 — D5, D6.** Package split, compiled output, exports maps, peers, Changesets, CI publish workflow (dry-run only), CLI hand-off to the project version, app-bundled CLI + "Install 'abuddy' command in PATH" action, Homebrew formula file in the repo.

**Phase 4 — D4.** `abuddy test` app resolution (prompt, config, CI flags, beta download with checksum + cache) and the `release.sh` beta-before-prod rule. Stop running Playwright through `npx playwright`: run the runner that matches the fixture's `@playwright/test`.

**Phase 5 — test isolation (N3, N4).** The fixture creates a temp `ABUDDY_USER_DATA_DIR` per worker (the variable already exists), installs only the pack under test, and drops the `.dev` skip-sync shortcut. Report boot time before/after. Update `packages/abuddy-testing/CLAUDE.md` (formerly `packages/abuddy-sdk/src/testing/CLAUDE.md`) and `tests/e2e/CLAUDE.md`.

**Phase 6 — hardening.** F4–F7 and F9 in `sdk-bridge-drift.spec.ts` (mutation-check each), F10 (assert the "No machine export found" message), F11 (renderer `loadPackFEEntry` warns when an entry registers no plugins).

## End state

Proven by a script in a temp dir outside the monorepo, and added to CI:

1. Install `@abuddy/cli` + `@abuddy/sdk` from locally packed tarballs (`npm pack`).
2. `abuddy init` → `add feature` → a flow using keepAlive from default-setup.
3. `abuddy build` → `abuddy release --local --dry-run` produces a verified bundle.
4. Install that bundle into an isolated test data dir.
5. `abuddy test` passes against a downloaded-or-configured app.

No `ABUDDY_ROOT`, no symlinks, no PATH edits.

## Constraints

- Commit as you go, in logical chunks, with conventional commit messages and no Claude Code attribution (no Co-Authored-By or Claude-Session lines). Never push or create tags. Something outside the session may stage files: check `git diff --cached` before each commit and only commit what that commit covers.
- Never publish anything externally: no `npm publish` (use `--dry-run` and `npm pack`), no real GitHub releases (use `--dry-run` or a mocked GitHub API in tests), no Homebrew tap pushes. CI workflows may be written, not triggered.
- Never use broad pkill/killall on Electron or node. E2E runs alongside the user's dev and prod apps in the `abuddy-test` namespace.
- Don't launch the app outside the test environment (`npm start`, packaged builds) without isolating `ABUDDY_USER_DATA_DIR` to a temp or copied dir.
- Never run bare tsc on `packages/preload`.
- Don't edit version/release metadata of the monorepo (package versions, changelogs). Pack version bumps inside temp test packs are fine.
- Don't run `npm install` in the example pack. It wipes the `node_modules/@playwright/test` symlink the pack relies on until phase 4 lands.
- Investigate failing tests before changing assertions; never loosen one to go green. Mutation-check every new guard or test.
- No polling or hacky workarounds; prefer event-driven fixes.
- Keep changes minimal within each decision; prefer libraries over hand-rolled wrappers (e.g. Octokit, Changesets).
- External packs are first-class. Don't assume there are none.
- Manual API boots: `cd packages/api && ABUDDY_ENV=development ABUDDY_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node dist/server.js`.
- Until phase 4 lands, the example pack's `abuddy test` needs `PATH="/Users/spankyed/Develop/Projects/AgentBuddy/node_modules/.bin:$PATH"` (for playwright) and `ABUDDY_ROOT=/Users/spankyed/Develop/Projects/AgentBuddy`.
