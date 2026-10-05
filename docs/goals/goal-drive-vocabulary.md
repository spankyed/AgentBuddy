# Goal: a drive session an agent can extend, in words it can guess

> **Written in session** `acfdcbe9-f87e-4349-a1e3-a03cdf58065c` (Claude Code, 2026-10-05). Resume it with
> `claude -r acfdcbe9-f87e-4349-a1e3-a03cdf58065c`.

```
# Goal: a drive session an agent can extend, in words it can guess

Implement docs/goals/goal-drive-vocabulary.md on a branch cut from master, at or after `19ffed81a` — the
base its Background was surveyed at.
Before Phase 1, confirm the base: `packages/abuddy-testing/src/engine/server.ts`,
`packages/abuddy-testing/src/index.ts`'s `driveEngineBody`, and `scaffold()` in
`packages/abuddy-cli/src/commands/drive.ts` exist at HEAD, and that last file still writes the two engine
files unconditionally. If any of that has changed, stop and say so — the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.

Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, rename verbs, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Nothing here is stored user data.

Finished when:
- Phases 1-4 are implemented and each meets its "Done when"; every new verb has a case against the
  session's fake page, and every new guard is mutation-checked.
- `abuddy drive --serve` writes the engine scaffold only when it is absent, and a session file with a
  verb added to it survives the next run.
- No POST path is a noun and no GET path is a verb; one concept has one field name across every request
  and response in the table. A spec derives both from `engineVerbs` and fails on a new violation.
- `/plugin`, `/click`, `/fill`, `/press`, `/snapshot` and `/logs` answer against a running app, shown by
  driving one — not only by a unit case.
- `npm run typecheck`, `npm run lint:check`, `npm run test:unit`, `npm run api:update` (and the committed
  `etc/`), `npm run test:external-pack:contract`, `npm run chain`.
- A live session: `npm run drive:serve`, then every verb in the table exercised once, with the output of
  the ones that changed quoted in the summary.
- A final summary: phase -> done/deferred, evidence, and the conventional choices made.
- The doc is in `docs/archive/goals/`, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green - not once at the end. A phase is
  landable on its own; a commit is how that stays true. Conventional message, no Co-Authored-By or
  session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never (the standing list — git, publishing, real data dirs, process kills, preload's tsc, release
metadata, typed EARS, shims and loosened assertions — plus this goal's own):
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir. A drive session gets
  an ephemeral instance; `abuddy drive` defaults to one, and `--instance` is the only way to keep state.
- pkill/killall Electron or node. A session ends with POST /close, which is what runs the fixture's
  teardown; killing it skips the data-dir policy.
- add a verb to @abuddy/testing that belongs to one app's vocabulary. The engine ships primitives; a
  domain verb goes in the scaffold, which is the point of Phase 1.
```

## Background (2026-10-05, at `19ffed81a`)

`abuddy drive --serve` holds the app open and answers loopback HTTP, so an agent can ask many questions of
one warm app instead of editing a closed script and relaunching for each. It has **15 verbs**. Three
problems, all found by using it for a day.

**The scaffold is destroyed on every run.** `commands/drive.ts:177-178` writes the two engine files with a
bare `fs.writeFileSync`, every time:

```ts
fs.writeFileSync(path.join(dir, ENGINE_CONFIG_FILE), ENGINE_CONFIG);
fs.writeFileSync(path.join(dir, ENGINE_SESSION_FILE), ENGINE_SESSION);
```

Eleven lines below, `scaffold()` writes every *other* generated file the right way — `if (!fs.existsSync(file))`.
So the one file an agent would naturally extend is the one that cannot be. There is no extension point
either: `driveEngineBody` takes the fixture's `{ app, appPage }` and nothing else, so a verb this app wants
has to be added to `@abuddy/testing` and shipped to every pack, or not added at all.

**The vocabulary is not guessable.** Taken from `engine/server.ts`:

| | |
|---|---|
| the source a verb runs | `/eval` takes **`body`**; `/query` and `/transact` take **`code`** |
| a plugin | `/navigate` takes **`plugin`**; `/state` returns **`activePluginId`** and **`pluginIds`** |
| sending an event | `/send` takes `{ event }`; `/system` takes `{ to, event }` — two verbs for one act |
| naming | every POST is a verb except `/system`, a noun; `/qx` and `/tx` are engine jargon on a public wire |
| reads | `/events`, `/drops` and `/errors` are **GET requests that clear**, so a retry returns different data |

The first row is not cosmetic: `/state` hands back `activePluginId`, and the only verb that consumes a
plugin rejects that name.

**It cannot use the UI.** There is no `/click`, no `/fill`, no `/press` — `grep` for them in `engine/`
returns nothing. A thing called "drive" can send bus events and `eval`, and cannot press a button a user
presses. Reading a plugin's state has no verb either: doing it takes a ~200-character `/eval` expression,
which this session wrote out **four separate times** to answer one question about the Notes plugin. And the
backend's own log has no verb, so `packages/abuddy-testing/CLAUDE.md` tells a reader to go and open
`drive/results/app-<n>.log` by hand.

## Decisions

**D1. The engine ships primitives; the scaffold owns domain verbs.** `@abuddy/testing` gets verbs that are
true of any AgentBuddy app. A verb built out of this app's nouns — "create a thread", "approve the pending
tool call" — belongs in the session file, which its owner edits. That is what makes the scaffold worth
keeping across runs, and what keeps the engine from growing one app's vocabulary.

**D2. The scaffold is generated once.** The engine files join `scaffold()`'s write-if-absent loop. Flipping
this is safe *in the same change* precisely because today's write is unconditional: every existing scaffold
is current at the moment we stop rewriting it. In-repo copies (`drive/`, and any fixture pack) are migrated
by hand in that change, and no pack exists outside this repo (`install.ts:17` throws for every name), so
there is nothing else holding an old copy.

**D3. `driveEngineBody` becomes a factory.** `driveEngineBody({ verbs })` returns the test body, so the
scaffold reads as a call with options and a new option is a compile error at the one call site rather than
a `page.waitForState is not a function` against a running app — which is the failure its own doc comment
records from last time. Extra verbs are merged *over* the core table, so a scaffold may also replace one.

**D4. Three naming rules, and a spec that holds them.**
- **A POST is a verb, a GET is a noun.** `/system` folds into `POST /send { to?, event }` (no `to` means
  the app's root actor, which is what `/send` does today). `/qx` and `/tx` become `/query` and `/transact`;
  the names `qx` and `tx` stay inside the code you write, where they are the real API.
- **One concept, one field name, in requests and responses.** `code` is any source the session runs.
  `plugin` and `plugins` name plugins everywhere, so `/state` stops saying `activePluginId`.
- **Every response stays `{ ok, value }` or `{ ok: false, error }`**, with `4xx` reserved for a request
  that never ran. Unchanged; it is the one part of the surface that is already consistent.

**D5. A read does not clear.** `/events`, `/drops` and `/errors` become POST, keeping the drain. Draining is
right — a session open for an hour would otherwise accumulate every event and fail at the end over ones the
agent already read — but it is not a GET, and a retried request returning different data is a trap worth
two characters to remove.

**D6. `/snapshot` over screenshots for reading the page.** An ARIA tree (`locator.ariaSnapshot()`) is
readable, diffable, cheap and costs no image tokens; `/screenshot` stays for a human looking at the result.

**D7. `/flow` is deferred, not dropped.** Triggering a flow and awaiting its tracks is the highest-value
domain verb this app could have, and it is bigger than every other verb here combined: the harness's
`runFlow` works against `TestApp`, which a drive session does not have — it drives a real app over
Playwright and the bus, so the verb has to send `TRIGGER_BRAIN_EVENT` and follow the brain's
`TNODE_SPAWNED`/`TNODE_UPDATED` reports itself. It gets its own goal. Phase 1 is what makes it writable as
a scaffold verb in the meantime.

## Phases

### Phase 1 — The scaffold is generated once, and is an extension point

- `driveEngineBody({ verbs? })` returns the body. `verbs` is `Record<string, Verb>`, merged over
  `engineVerbs(session)` so a scaffold can add or replace one.
- `runDriveEngine` takes the extra verbs through to `startEngineServer`.
- The engine files move into `scaffold()`'s write-if-absent loop; the unconditional writes at
  `drive.ts:177-178` go.
- The template gains two commented example verbs, in this app's vocabulary, so the extension point is
  shown rather than described.
- Migrate this repo's `drive/engine-session.mts` to the new call.

**Done when:** adding a verb to a session file and running `--serve` again keeps it, shown by a spec over
the CLI that writes a file, edits it, scaffolds again and reads it back; and a session spec shows an extra
verb answering and overriding a core one. Both mutation-checked.

### Phase 2 — The vocabulary

- Apply D4 and D5 across `engine/server.ts`, `engine/session.ts` and the `EngineSession` interface.
- Rename in every caller: `docs/public-facing/cli.md`'s verb table, `drive/README.md`,
  `packages/abuddy-testing/CLAUDE.md`, the root `CLAUDE.md`'s drive paragraph.
- A spec in `@app/repo-checks` derived from `engineVerbs`: no POST path is a noun, no GET path is a verb,
  and no two verbs name one concept differently. The population is the table itself, asserted non-empty.

**Done when:** the spec passes, and fails when a verb is added that breaks either rule — both directions
mutation-checked. The guessability claim is testable: every field name in the table appears in the
response that produces it.

### Phase 3 — The verbs that were missing

| verb | takes | does |
|---|---|---|
| `POST /plugin` | `{ plugin, select? }` | the plugin's published state, optionally a dotted path into it |
| `POST /click` | `{ selector }` | clicks it |
| `POST /fill` | `{ selector, text }` | types into it |
| `POST /press` | `{ key, selector? }` | a key, to the page or an element |
| `GET /snapshot` | `{ selector? }` | the ARIA tree of the page or a subtree |
| `POST /logs` | `{ since?, source? }` | the app's own log lines, from `app-<workerIndex>.log` |

- `SessionPage` gains the page methods; `asSessionPage` implements them with Playwright, and the fake in
  `session.spec.ts` gains them so every verb is testable in process.
- `/logs` reads the path `appLogPath` already computes (`index.ts:196`); `runDriveEngine` has the
  `outputDir` it needs.

**Done when:** each verb has a case against the fake, and all six are exercised against a running app in
one `npm run drive:serve` session, with the output quoted.

### Phase 4 — The domain verbs that are not app-specific

| verb | takes | does |
|---|---|---|
| `GET /settings` | `{ feature? }` | the stored settings, or one feature's |
| `POST /settings` | `{ feature, path, value }` | writes one, through the settings system |
| `POST /secrets` | `{ provider, label }` | adds a key's metadata, so inference is reachable |
| `POST /inference` | `{ reply }` | a fixed model answer for this session, so a flow is reproducible |

These are the app's, not one pack's: every AgentBuddy app has settings, secrets and inference. A verb about
threads or the library is not here, and Phase 1 is where it goes.

**Done when:** each has a case, and a session can add a secret, mock a reply and read a setting back.

## Deferred

- **`/flow`** — see D7. Its own goal; Phase 1 makes it writable as a scaffold verb first.
- **`/windows`** — list and focus windows. A plugin runs once per window and the whole `client` routing
  exists for that, so multi-window bugs are real here; no evidence yet of an agent needing to drive two.
- **The empty test** at `packages/repo-checks/tests/with-source.spec.ts` —
  `it('leaves it off for a run that declared it resolves the published packages', () => {})` asserts
  nothing. It predates this work and what it was meant to pin is unknown; fix it or delete it, but not
  by guessing.

## Constraints

- **The engine stays dependency-free.** `api-client.ts` writes tRPC frames by hand against Node's global
  `WebSocket`; its header records the version they were read at. A new verb that needs the API adds no
  dependency and keeps that comment true.
- **`/screenshot` refuses a name that is not a name.** It is the one verb whose input becomes a path, and
  `../../escaped` wrote outside the screenshots directory once. Any new verb taking a path-like argument
  gets the same treatment, with its own case.
- **A verb that fails answers `200` with `ok: false`.** `4xx` means nothing ran: a bad token, an unknown
  path, a malformed body. Keep that split; it is what lets a caller tell "the app said no" from "I asked
  wrongly".
- **Every verb is testable in process.** The session takes two narrow ports (`SessionPage`, `SessionApi`)
  precisely so a verb is exercised against a fake rather than by launching Electron. A verb that cannot be
  is a verb in the wrong layer.
- **No bare sleeps in a new spec.** `spec-waits.spec.ts` gates this; a wait is driven by the thing it waits
  for, and a deadline belongs on the failure path.
