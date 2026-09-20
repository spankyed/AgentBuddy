> **Written in session** `358d44db-c4f3-4dfe-89d3-40b001a63086` (Claude Code, 2026-09-20). Resume it with `claude -r 358d44db-c4f3-4dfe-89d3-40b001a63086`.

```
# Goal: the app's process plumbing lives in the app, not in the pack contract

Implement docs/goals/goal-api-endpoint-out-of-the-sdk.md on AS/external-pack-authoring, at or after
ef358680f — the base its Background was surveyed at.
Before Phase 1, confirm the base: `packages/abuddy-sdk/src/env/index.ts` exports `readApiEndpoint` and
re-exports `_lockIsHeld`/`_recordIsStale` from `./process-liveness.ts`, and
`packages/default-setup/dev-build.mjs` imports `readApiEndpoint`. If they don't, stop and say so — the
plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- `@abuddy/sdk/env` exports neither `readApiEndpoint`, `ApiEndpoint`, `_lockIsHeld` nor `_recordIsStale`,
  and `git grep` finds no pack source importing them.
- `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm test`, `npm run test:external-pack`
  all pass, and `npm run api:update` has been run with `etc/` committed.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A
  phase is landable on its own; a commit is how that stays true. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- move `resolveAppContext`, `getAppVersion` or `AppContext` out of the SDK. Packs resolve their
  environment through them, and `apiPortFile` stays on `AppContext` (Decision 1).
- give `default-setup` a dependency on `@abuddy/host` or `@abuddy/cli` to unblock this (Decision 2).
```

## Background

Surveyed at `ef358680f` on `AS/external-pack-authoring`.

`@abuddy/sdk/env` carries three things that are the app's plumbing, not the pack contract:
`readApiEndpoint` (and its `ApiEndpoint` type), and the two liveness predicates `_lockIsHeld` and
`_recordIsStale` re-exported from `env/process-liveness.ts`. The module says so itself:

> `@internal`: this is app plumbing, not part of the pack contract. It lives here because `readApiEndpoint`
> does, and that is reachable from a pack's build script, which cannot import `@abuddy/host`.

**The liveness predicates have no pack-side consumer at all.** All four callers are host:
`database/write-lock.ts`, `database/running.ts`, `packs/staging.ts`, `packs/dev-server.ts`. They are in
the SDK only because `readApiEndpoint` is, and `readApiEndpoint` calls `_recordIsStale`.

**`readApiEndpoint` has one pack-side caller**, `packages/default-setup/dev-build.mjs:97`, and it does not
need it:

```js
const api = readApiEndpoint(apiPortFile);
const token = readDevFile(apiTokenFile);
if (!api || !token) return;
try { await fetch(`http://${API_HOST}:${api.port}/dev/reload`, …); } catch { /* API not ready yet */ }
```

The fetch is already wrapped in a catch that ignores failure. A port file naming a dead port fails there
and nothing happens — the same outcome as `readApiEndpoint` returning `null`. The liveness check buys
nothing at this call site, and cannot: the API may exit between the check and the POST. The script already
reads the token file with its own two-line `readDevFile`; reading a port the same way is no more
duplication than it already has, and duplicates no rule, because it applies none.

Every other caller is host or above: `database/running.ts` (host), `abuddy-cli/src/commands/dev.ts` (the
CLI, which inlines host), `api/tests/unit/dev-reload-access.spec.ts` (the API, which depends on host). The
`ApiEndpoint` type's only writer is `api/src/setup/websocket.ts`, which publishes the file.

So the blocker in `docs/plans/external-pack-authoring-followups.md` — "blocked on removing that script's
need to discover the API first, which is its own change" — is smaller than recorded. The script doesn't
need to discover the API. It needs a port number.

## Decisions

1. **`resolveAppContext`, `AppContext` and `apiPortFile` stay in the SDK.** Environment identity is the
   pack contract, and a pack's build script legitimately asks where the app's files are. What moves is the
   reading of what a running process wrote there.

2. **`default-setup` gains no new dependency.** It is a pack, built and tested the way every pack is, and
   a dependency on `@abuddy/host` or `@abuddy/cli` to make one dev script work is the failure
   `check:specifiers` exists to prevent. `dev-build.mjs` parses the port file itself.

3. **One module in host: `src/process-liveness.ts`, exported as `./process-liveness`.** It holds both
   predicates, `readApiEndpoint` and `ApiEndpoint`. They are one topic — what a running process left on
   disk, and whether it is still running — and `readApiEndpoint` is the only reader outside host's own
   files that needs the bound. `./logs` is the precedent for a top-level single-file export.

4. **The predicates lose their `_` prefix and `@internal` tags.** In a published package the underscore is
   what makes the boundary checkable — `check:specifiers` rejects a pack importing `_x`. `@abuddy/host` is
   private and packs cannot import it at all, so in host the prefix marks nothing and the tag is noise.
   They become `lockIsHeld` and `recordIsStale`.

5. **`build/packages-built.ts` keeps its own copy**, and its comment is repointed at the new name. Its
   reason is unchanged: it is the freshness check the package builds run through, so it resolves the
   packages' published `dist` — the stale copy, while they are being built.

## Phases

### Phase 1 — `dev-build.mjs` stops discovering the API

It reads the port out of the port file with the helper it already has for the token, and lets the existing
catch handle a port nothing is listening on.

**Done when:** `packages/default-setup/dev-build.mjs` imports nothing from `@abuddy/sdk/env` but
`resolveAppContext`, and `npm start` still reloads the built-in pack on a rebuild.
**Mutation:** pointing the port file at a closed port leaves the watcher running and silent, as it does
today.

### Phase 2 — the module moves to host

`env/process-liveness.ts` and `readApiEndpoint`/`ApiEndpoint` move to
`packages/abuddy-host/src/process-liveness.ts`, exported as `./process-liveness`. The predicates are
renamed (Decision 4). Callers move with them: `database/running.ts`, `database/write-lock.ts`,
`packs/staging.ts`, `packs/dev-server.ts`, `abuddy-cli/src/commands/dev.ts`,
`api/src/setup/websocket.ts` (the type), `api/tests/unit/dev-reload-access.spec.ts`.

**Done when:** `@abuddy/sdk/env` exports none of the four names and the full typecheck passes.
**Mutation:** re-exporting one of them from the SDK and importing it in a pack source fails
`check:specifiers`.

### Phase 3 — the tests move

`abuddy-sdk/tests/env/process-liveness.spec.ts` moves to `abuddy-host/tests/`, and the `readApiEndpoint`
cases move out of `abuddy-sdk/tests/env/app-context.spec.ts` with it.

**Done when:** both suites pass and no SDK test imports a moved name.
**Mutation:** the five liveness mutations recorded in `goal-loaded-packs-on-the-registry.md`'s outcome
still each fail the right test from their new home.

### Phase 4 — the reports and the docs

`npm run api:update` (the SDK loses four exported names; `@abuddy/ui`'s stamp follows). Then the root
`CLAUDE.md` (`@abuddy/sdk/env`'s one-line role), `abuddy-host/CLAUDE.md` (its "Process liveness
(`@abuddy/sdk/env`)" section and module map), `abuddy-sdk/CLAUDE.md` (the `env/` bullet), and
`docs/plans/external-pack-authoring-followups.md`, whose deferred entry this closes.

**Done when:** `npm run api:check` passes and no doc places these names in the SDK.

## Deferred

- **Whether `apiPortFile` and `apiTokenFile` belong on `AppContext` at all.** They are paths the app
  writes and local tools read, and a pack's build script is the only pack-side reader. Narrowing
  `AppContext` is a separate question about what the environment contract is for.

## Constraints

- `api/src/setup/websocket.ts` writes the port file and must keep writing the same shape; the type moving
  is not licence to change it.
- The CLI inlines `@abuddy/host` when bundling, so `abuddy dev` importing from host costs nothing at
  publish time — but check `npm run packages:check` all the same.
- `@abuddy/testing`'s bundle must not gain a repo-root path from the move (the reason
  `build/packages-built.ts` lives where it does).

## Outcome (2026-09-20)

All four phases done, on `AS/external-pack-authoring`.

### Per phase

- **Phase 1 — `dev-build.mjs` stops discovering the API** (`2a5854631`). A `readDevPort` beside the
  `readDevFile` it already had. `resolveAppContext` is now its only import from `@abuddy/sdk/env`.
- **Phases 2 and 3 — the move and the tests** (`c28c9ca05`). `@abuddy/host/process-liveness` holds
  `lockIsHeld`, `recordIsStale`, `readApiEndpoint` and `ApiEndpoint`. Seven call sites moved; the
  predicates lost their `_` prefix and `@internal` tags (Decision 4).
- **Phase 4 — the reports and the docs.** `etc/env.api.md` lost all four names.

### Conventional choices

- The export is listed in `sdk-bridge-drift.spec.ts`'s `UNBRIDGED_BY_DESIGN`, which is what caught the new
  subpath: a pack reaches a running API through the app, never by reading its port file.
- The root `CLAUDE.md` gained a line for the subpath beside the other `@abuddy/host/*` entries; its
  `@abuddy/sdk/env` line already said only `resolveAppContext`, `getAppVersion` and needed no change.

### Corrections to the Phases

- **Phases 2, 3 and Phase 4's `api:update` landed as one commit.** The plan had them separate and each
  landable. They are not: moving the module leaves the SDK's own tests importing names it no longer
  exports, and `check:api-stamp` fails until the reports are regenerated. There is no commit in between
  that builds, so splitting would have meant shipping one that doesn't.

### Open items

The Deferred note stands: whether `apiPortFile` and `apiTokenFile` belong on `AppContext` at all is a
separate question about the environment contract's scope.

### Final verification

`npm run typecheck` ✅ · `npm run test:unit` ✅ (8/8 suites) · `npm run build` ✅ · `npm test` ✅ (13) ·
`npm run test:external-pack` ✅ (23 + 8 + 1) · `npm run packages:check` ✅ (exit 0, findings unchanged and
ignored by resolution).

All six liveness mutations still fail the right test from the new home: `lockIsHeld` always free, EPERM
read as gone, the boot bound dropped, a missing file read as fresh, the pid ignored, and `readApiEndpoint`
skipping the staleness check.
