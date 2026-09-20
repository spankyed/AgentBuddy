> **Written in session** `358d44db-c4f3-4dfe-89d3-40b001a63086` (Claude Code, 2026-09-20). Resume it with `claude -r 358d44db-c4f3-4dfe-89d3-40b001a63086`.

```
# Goal: a lock the kernel releases, and liveness questions asked of the thing itself

Implement docs/goals/goal-write-lock-advisory.md on AS/external-pack-authoring, at or after
b1eaa70f4 — the base its Background was surveyed at.
Before Phase 1, confirm the base: `packages/abuddy-host/src/database/write-lock.ts` writes a JSON lock
file and resolves it with `lockIsHeld`, and `packages/abuddy-host/src/process-liveness.ts` exports
`lockIsHeld`, `recordIsStale` and `readApiEndpoint`. If they don't, stop and say so — the plan was
surveyed somewhere else.
Read Background, Decisions, Open decisions, Phases, Tradeoffs and Constraints first.
Phase 0 is a spike whose result decides Phase 3. Do not start Phase 3 until Open decision 1 is settled
and recorded in this document.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 0–2 are implemented and each meets its "Done when"; Phase 3 is implemented or recorded as
  rejected with the spike's reason. Every new guard, helper or test is mutation-checked.
- `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm test`, `npm run test:external-pack`
  all pass; `npm run api:update` run and `etc/` committed if a public entry changed.
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
- use `proper-lockfile` or any heartbeat-based lock. Its heartbeat lapses under the synchronous LMDB
  work the lock protects, producing the exact double-writer it prevents (Decision 5).
- let locking fail open. If the lock cannot be taken or read, a write must be refused (Decision 6).
- remove `lockIsHeld`. Chromium writes the instance lock and we cannot change its format (Decision 1).
```

## Background

Surveyed at `b1eaa70f4` on `AS/external-pack-authoring`.

**A correction first.** This work was recorded as "it would delete the `lockIsHeld`/`recordIsStale` split
entirely". That is wrong, and the survey is where it shows. Four call sites use the predicates, and an
advisory lock can replace exactly one:

| Record | Written by | Can an advisory lock replace the liveness check? |
|---|---|---|
| `db-write.lock` (`write-lock.ts:57`) | our tools | **Yes.** A mutual-exclusion lock held for a duration is what `flock` is |
| Chromium's `SingletonLock` (`running.ts:31`) | **Chromium** | **No.** We don't write it and can't change its format |
| staging dirs (`staging.ts:30`) | our installer | No. A record of an install that was in progress, read once at boot, not a lock |
| dev-server marker (`dev-server.ts:75`) | `abuddy dev` | Not by a lock — but the question has a better answer (Decision 2) |

**What the write lock's residual failure actually is.** The handlers are registered *before* the file is
written, so `SIGINT`/`SIGTERM`/`SIGHUP` and normal exit all release it; `write-lock.spec.ts` pins that.
What is left is `SIGKILL` and power loss, and the recovery is one `rm` behind an error that names the
file. That is the whole of what an advisory lock buys here.

**Where a native module would land.** `holdDatabaseWriteLock` is called from
`abuddy-cli/src/commands/db/target.ts:90` — the **published** CLI. A native dependency in this path
becomes a dependency of every pack author's `npm i @abuddy/cli`, on every platform they use, not just the
`mac-arm64` the app ships as.

**The ABI constraint.** The packaged app is Electron. `@napi-rs/keyring` works there because N-API is
ABI-stable across Node and Electron. A `node-gyp`/NAN module (`fs-ext` and its relatives) needs
`electron-rebuild` and a binary per Electron version — a build chain this repo does not have.

**Two of the four questions have exact answers that need no lock at all.** `readApiEndpoint` and the
dev-server marker both exist so a caller can decide whether to talk to an endpoint. Asking the endpoint is
both exact and cheaper than inferring it from a pid and an mtime — and it catches a process that is alive
but no longer serving, which no pid check can. `dev-build.mjs` already works this way after
`2a5854631`: it reads the port and lets the request fail.

## Decisions

1. **`lockIsHeld` stays.** Chromium's instance lock is not ours to change, and a pid check is the only
   thing available for it. Its `ifUnsure: 'held'`-shaped bias is still right there: missing a live app
   lets a tool write under it.

2. **The API port file and the dev-server marker ask the endpoint, not the pid.** `readApiEndpoint`
   becomes "the API that answers on this data dir", and the `pack://` handler's marker check becomes
   "the dev server that answers". Both are exact where the pid check was an estimate.

3. **`recordIsStale` stays for staging recovery.** It runs once at boot over directories nothing is
   listening on; there is no endpoint to ask, and the cost of being wrong is a directory restored that
   did not need it.

4. **The lock file keeps the information; the lock carries the authority.** `db-write.lock` still holds
   `{ pid, machine, what, since }`, so `findDatabaseWriter` can still say *"abuddy db import (pid 1234)"*.
   What changes is that "is it held" is answered by the advisory lock rather than by reasoning about the
   pid. A file with no lock behind it is a leftover, not a holder.

5. **No heartbeat locks.** `proper-lockfile` and anything else that renews an mtime lapses under the
   synchronous LMDB work the lock protects, producing the double-writer it exists to prevent.

6. **Locking fails closed.** If the addon will not load, or the filesystem will not honour the lock, a
   write is refused with an error saying why. The current scheme degrades to a pid guess; the new one
   must not degrade silently to nothing.

## Open decisions

**1. Which advisory-lock implementation — and whether one exists that clears the bar.** Settle before
Phase 3, and record the answer here.

The bar, all of which must hold:

- **N-API / ABI-stable**, so the same binary serves Node and Electron with no `electron-rebuild` step.
- **Prebuilt binaries** for at least `darwin-arm64` (the app), plus `darwin-x64`, `linux-x64` and
  `win32-x64` (pack authors running the published CLI) — or a pure-JS fallback that satisfies Decision 6.
- **Works from an asar-unpacked app bundle**, as `@napi-rs/keyring` does.
- **Maintained**, with the lock released by the kernel on process death — the property this is all for.

If nothing clears it, the options are: write a small napi-rs addon in-repo (adds Rust and
cross-compilation to the release chain, for one function), or **reject Phase 3** and keep the pid-based
write lock. Rejecting is an acceptable outcome; Phases 1 and 2 stand on their own and are where most of
the value is.

## Phases

### Phase 0 — the spike

Evaluate candidates against Open decision 1 on this machine and in a packaged build. Write the result
into this document as "Spike results", including what was rejected and why.

**Done when:** Open decision 1 is settled in writing, with the candidate's package name, version, the
platforms its prebuilds cover, and evidence it loads under Electron without a rebuild.

### Phase 1 — `readApiEndpoint` asks the API

It connects to the port it read rather than checking the publisher's pid. A file naming a port nothing
answers on reports no API, as it does today; a file naming a port something *else* now holds stops being
reported as ours, which the pid check could not tell.

**Done when:** `findRunningApp` and `abuddy dev` still report a running app, `process-liveness.spec.ts`
covers a port nothing listens on and one a different process holds, and no caller passes a pid to decide
this. **Mutation:** removing the connect check makes the "port nothing answers on" case report an API.

### Phase 2 — the dev-server marker asks the dev server

`devServerUrl` returns the URL when the server answers. The diagnosis this preserves is the one
`c74ef2f56` added it for: a marker a crashed `abuddy dev` left behind must not be served from, and the
reason must name the marker.

**Done when:** `dev-server.spec.ts` covers a marker whose server answers and one whose server is gone,
and the failure names the marker file. **Mutation:** serving from a dead marker fails the second.

### Phase 3 — the advisory lock (gated on Phase 0)

`holdDatabaseWriteLock` takes an exclusive non-blocking lock on `db-write.lock` and holds it for the
tool's life; `findDatabaseWriter` reads the file for *who* and tries the lock for *whether*.
`assertNoDatabaseWriter` is a lock attempt, not a pid check. The interrupt handlers and the `exit`
listener stay — they remove the file, which the kernel does not — but they stop being what makes the
lock correct.

**Done when:** a child killed with `SIGKILL` while holding the lock leaves a data dir the next tool can
lock, which `write-lock.spec.ts` currently documents as impossible. **Mutation:** not holding the lock
past acquisition lets a second holder in.

### Phase 4 — the filesystem the lock is on

A data dir on a network or synced filesystem is where advisory locks are least reliable. Detect at
acquisition whether the lock is honoured (take it, attempt to take it again from a child, expect
failure) and refuse the write with an error naming the directory when it is not (Decision 6).

**Done when:** a directory whose locks are not honoured refuses a write rather than proceeding.

## Tradeoffs recorded

- **A native dependency in the published CLI.** Every pack author running `abuddy db` on any platform
  gains it. Accepted because locking must fail closed and a pure-JS lock cannot (Decision 5). The cost is
  why Phase 3 is gated on prebuild coverage rather than assumed.
- **The `rm` escape hatch narrows.** Today any stuck lock is fixable by deleting a file, and the error
  says so. With a kernel-held lock, a stuck lock means a live process — so a leaked descriptor in a
  long-lived process would be unfixable without killing it. Mitigated by keeping the file and its message,
  and by the lock being held only for the duration of a `abuddy db` command.
- **A new silent-failure mode on network filesystems**, where today the scheme merely degrades to a
  guess. Phase 4 exists only because of this, and Decision 6 makes the failure loud.
- **Phase 1 changes what "an API is running" means** — from "the process that wrote this is alive" to
  "something answers on this port". A different process that has taken the port now reads as *not* our
  API, which is more correct; but an API that is alive and wedged now reads as not running, where the pid
  check called it running. For `findRunningApp`, whose job is to stop a tool writing under a live app,
  that is the wrong direction. Phase 1 must therefore treat *anything answering* as an app, and only a
  refused connection as none.

## Deferred

- **Staging dirs and `packages-built`'s lock.** Both could hold an advisory lock. Neither has a failure
  worth the change: staging recovery runs once at boot, and the build lock is the one place that
  deliberately keeps its own copy of the rule.
- **Whether `assertNoDatabaseWriter` should wait rather than refuse.** A blocking lock with a timeout
  would let the app start once a tool finishes instead of telling the user to try again. A behaviour
  change with its own UX question.

## Constraints

- `write-lock.spec.ts`'s existing tests are the contract: the signal cases, the take-over case, the
  another-machine case, and "a release only removes this process's own". A phase that makes one fail has
  the design wrong, except the take-over case, which Phase 3 changes on purpose — a lock nobody holds is
  takeable because the kernel says so, not because a pid is gone.
- The lock must work between a **Node** process (`abuddy db`) and an **Electron** process (the app's API
  boot). Same file, two runtimes: this is the case to test first in the spike.
- `@abuddy/testing`'s harness and the CLI bundle both inline host; a native dependency must not break
  `npm run packages:check`.
