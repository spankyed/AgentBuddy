```
# Goal: fix the external-pack-authoring PR review findings

Fix the findings in docs/issues/goal-pr-review-fixes.md on branch
AS/external-pack-authoring. Work High → Medium → Low. Items are verified;
don't re-review the PR. Where a fix needs a design choice, pick the
conventional option, note it in the final summary, and keep going.

Finished when:
- Every High and Medium item is fixed with a regression test that fails
  without the fix (mutation-checked), or marked out of scope with a reason.
- Low items are fixed or listed as deferred.
- `npm run typecheck`, `npm run typecheck -w @app/main`, and the api, sdk,
  cli, default-setup and renderer unit suites pass.
- `npm run test:external-pack`, the monorepo smoke E2E and
  `npm run test:packaged-authoring` pass.
- You give a final summary: item → fixed/deferred, with evidence.

Never:
- push or tag. Commit as you go in logical chunks (conventional messages, no
  Co-Authored-By or session lines); stage only each commit's files.
- npm publish, create GitHub releases, or trigger workflows (dry runs/mocks only).
- pkill/killall Electron or node; launch the app outside the test env without
  an isolated ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, or edit monorepo version/release metadata.
- loosen a failing assertion instead of investigating.
```

## Findings

Context: `docs/issues/goal-external-pack-authoring.md` (decisions D1–D7).

### High

1. **Settings wiped every boot by a failing pack seed.** `packages/api/src/packs/pack-seed.ts` doesn't store the hash on failure, so the pack reseeds each boot. Reseeding runs the settings seeder (`packages/abuddy-sdk/src/seed/settings-seeder.ts`), whose `resetSettings()` replaces all app settings, onboarding state and seed hashes. Pack seeds must never reset host settings wholesale, and a persistent failure must not loop destructive work.
2. **App-bundled `abuddy test` can't launch Electron.** `packages/abuddy-cli/bin/app-launcher.sh` sets `ELECTRON_RUN_AS_NODE=1`. It leaks through `abuddy test` into `_electron.launch` (`packages/abuddy-testing/src/index.ts`). Strip it in `fixtureEnv` and in the fixture's launch env.
3. **`--app beta` never matches a release.** GitHub turns spaces in asset names into dots (`AgentBuddy.Beta-…zip`). `packages/abuddy-cli/src/app/beta-app.ts` expects `AgentBuddy Beta-…`. Match GitHub's stored name, and make the unit test use real stored names.
4. **The scaffolded CI release workflow can't resolve built-in dependencies** such as `default-setup`. There's no workspace, installed app, configured app or cache on a runner (`commands/init.ts` workflow template, `commands/fetch-deps.ts`). Give CI a way to get host built-in types/build, e.g. from a downloaded beta app or a published artifact.
5. **Dependency cache is never refreshed, and ranges are ignored.** `resolveDepArtifacts` returns `.abuddy/deps/<id>` forever. No source checks the declared range, and an installed production app shadows `--app-root`/`ABUDDY_ROOT`.
6. **Public SDK components fail in pack builds.** `fe/components/tiptap/TiptapEditor.vue` and `SimpleMonacoEditor.vue` import undeclared packages (`highlight.js`, `@tiptap/extension-*`, `@guolao/vue-monaco-editor`). Declare, externalize, or stop exporting them (`packages/abuddy-sdk/scripts/build-package.ts`).

### Medium

7. **`abuddy release --local` publishes twice.** The tag push triggers the scaffolded workflow, and the local publish also runs, so the second gets a 422 (`commands/release.ts`).
8. **`abuddy add flow` template imports `keepAlive`,** which a dependency-free scaffold doesn't have (`commands/add/flow.ts`).
9. **`abuddy add step` doesn't register the step** (the `updateRegisterArray` import search fails) and never sets up `steps.build`. **`abuddy add service`** writes a path codegen can't resolve (double `.ts`).
10. **Codegen input hash misses source changes** (`commands/generate-entries.ts`): service export shape, step `trackField`, `types.ts`, and whether `*-fe.ts` files exist.
11. **Seed state goes stale:**
    - A failed seed keeps the previous good hash, so rolling back is skipped.
    - `lastError` isn't cleared when the seed is unchanged or absent, and the update flow re-reports it.
12. **Promoted/regular betas fail `hostVersion: ">=X"`** (`0.4.0-beta.0 < 0.4.0`). Compare against the build's app version.
13. **Published SDK `.d.ts` break `moduleResolution: node16`** (extensionless specifiers). D5 asked for rolled-up types.
14. **`tests/scripts/test-packaged-authoring.sh` checks for `flows: 1`,** which is printed even with no flows. Assert the compiled flow exists instead.

### Low

- **`hostVersion` handling is inconsistent:**
  - The updater offers releases whose `hostVersion` the app can't satisfy.
  - `abuddy install` and the fixture skip `hostVersion`.
  - The boot loader compares with `>=` only.
- **`placePack` rollback and leftovers:**
  - It doesn't restore the old dir if the second rename fails.
  - Staging dirs leak.
  - `host-packs/*.publishing-*` dirs count as built-in ids.
- **Failed runtime load still reported as installed.** The `activatePack` result is ignored on install/update.
- **`build` and `pack` don't validate the manifest,** and `pack` packs a stale `dist/` after a failed build.
- **Release details:**
  - `bundle.json` records the parent commit, and `source.repo` may contain credentials.
  - Preflight skips the behind-origin and existing-tag checks.
  - Pack/dependency step collisions are silent.
  - GitHub dependency fetch takes any `.tgz`, with an optional checksum and no bundle verification.
- **App config:**
  - The first-run beta choice is saved before it's validated.
  - A malformed config crashes.
  - `~` paths are rejected.
  - Concurrent beta downloads can delete each other's app.
- **Codegen and renderer:**
  - Renderer warns "registers nothing" for backend-only packs.
  - Codegen stops at the first `build.ts` even when `trackField` is in `index.ts`.
- **Missing guards and tests:**
  - No check that `steps/build.ts` matches `register.ts`.
  - The drift guard's dev-entry check never runs in CI.
  - `build/prod/verify-node-modules.mjs` skips the bundled CLI's own deps and optional native binaries.
  - No unit test for the flow seeder's error path.
  - The E2E temp dir leaks when build or launch throws.
- **Stale references:**
  - Homebrew sha256 is stale.
  - `steps.build` is missing from `default-setup/CLAUDE.md` and `docs/public-facing/manifest.md`.
  - Docs still point to the removed `packages/abuddy-sdk/src/testing/CLAUDE.md`.

### Spec gaps (out of scope unless trivial; list in the summary)

- No PATH action on Windows/Linux.
- `abuddy-beta` defaults to production.
- Missing dependencies don't block installs, and dependency ranges aren't enforced.
- Boot seed failures aren't shown in the UI.
