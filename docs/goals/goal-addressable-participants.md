> **Written in session** `f122fdc5-84c9-467f-9c61-66330eab32d0` (Claude Code, 2026-10-04). Resume it with `claude -r f122fdc5-84c9-467f-9c61-66330eab32d0`.

```
# Goal: a named thing with an inbox can be sent to, and can answer whoever asked

Implement docs/goals/goal-addressable-participants.md on master, at or after f2a8df5fe — the base its
Background was surveyed at.
Before Phase 1, confirm the base: packages/api/src/transport/context.ts, packages/abuddy-host/src/refs.ts,
packages/abuddy-host/src/bus/machine.ts and packages/abuddy-testing/src/engine/session.ts exist at HEAD,
and `createContext` in that first file is still the empty `() => ({})`. If any differs, stop and say so —
the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — a standing rule,
not this goal's choice): change signatures, move modules, migrate every in-repo caller, test, fixture,
template and doc in the same change, and fix forward. Stored user data is the exception: it moves with
migrations. Nothing here stores anything, so no migration is expected.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard and helper is
  mutation-checked, with the mutation named in the phase actually run and seen to fail.
- A backend system can answer only the connection that asked it: `Message` carries an optional `client`,
  absent still means every window, and `send-scope.spec.ts` holds both halves.
- Pack code never names a connection: a handler replies with `replyTo(incoming)` from
  `@abuddy/sdk/events` and no pack source mentions `_origin` or a client id.
- `host/drive` resolves as a participant, and `packages/abuddy-testing/src/engine/session.ts` contains no
  request-id minting, no reply-id matching and no seen-events buffer.
- Checks: `npm run typecheck`; `npm run spec -- bus` and `npm run spec -- transport`; `npm run compile`;
  `npm run packages:build` then `npm run packages:check`; `npm run chain` at the end of each phase.
- `npm run api:update` for `@abuddy/sdk` once `replyTo` exists, with `etc/` committed. Report what moved
  in the public surface rather than rewriting a recorded artifact to make a check pass.
- Phase 5 is driven, not only unit-tested: `abuddy drive --serve` with three concurrent `/qx` calls
  returning three correct answers.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.
- The doc is in `docs/archive/goals/`, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. Phases 1
  and 2 both touch `packages/api/src/transport/bus.ts`, so the split is free only while each is finishing.
- Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files. Check `git diff --cached` first.
- Don't push, tag or open a PR unless the user asks.

Never:
- the standing prohibitions in Constraints below: git remote operations, publishing, real data dirs,
  broad pkill, bare tsc in preload, the example pack's install, release metadata, typed EARS behaviour,
  compat shims, loosened assertions.
- loosen `send-scope.spec.ts`'s "every window" case or `outgoing-events.spec.ts`'s "exactly as sent" case.
  Both are contract. Amend by adding a case beside them; if one must change, stop and ask.
- stamp an origin on an outbound event (system → plugin). Decision 4 scopes stamping to inbound only, and
  `outgoing-events.spec.ts` is what that protects.
- accept a client id from the wire. It is minted in `createContext` and stamped server-side; reading one
  from `bus.send`'s input makes a return address forgeable.
- give `to` an object shape, or add a second address separator. Decision 2 exists so neither is needed.
```

## Background (2026-10-04, at f2a8df5fe on master)

The drive engine (`packages/abuddy-testing/src/engine/`) lets an agent hold one warm app session and ask
it many questions. Every answer arrives on a firehose, so the engine mints a `requestId`, keeps a buffer
of seen events (`MAX_SEEN_EVENTS`) and matches replies by hand. Two rounds of fixes went into making that
reconstruction correct: a pending field per request site, a guard per reader, and a proposed 221-row
census to keep them honest.

That scaffolding exists because **the driver is not a participant in the actor system and so cannot
receive.** The same gap is why a reply to one window reaches all of them, which the repo had already
written down. `packages/api/src/transport/bus.ts`, in `packClientReady`'s doc comment:

> Their replies reach every client, not only this one: outgoing events carry no client address.

And `docs/archive/goals/goal-cleanup-and-docs.md:291` lists *"replies to one window go to every window"*
under "Known limitations", unexamined. Nothing in `docs/goals/wont-do/` or the archive suggests addressing
was considered and refused.

Three things are missing, each checked in source at this commit:

1. **No client identity exists anywhere.** `packages/api/src/transport/context.ts` is two lines:
   `export const createContext = () => ({});`. It discards the ws adapter's argument, which carries the
   per-client socket. The API token and `startupId` are per app *run* and identical in every window.
   `main | <pluginRef>` is already unique per window by construction (single-instance lock, popouts keyed
   by plugin id) but reaches neither the renderer's client nor the API.
2. **An envelope cannot name one connection.** `Message` is `{ to, event, from?, via? }`. `to` is a
   feature ref resolved to an in-process actor (`bus/machine.ts:185`, `system.get(to)`). `bus.send`'s zod
   input names every field explicitly, with the reason in a comment at `bus.ts:18-20`: *"zod strips what
   it isn't told about, so a field this line omits arrives as `undefined`"*.
3. **A receiver has nowhere to put a return address.** An XState actor receives an event object and
   nothing else. `outgoing-events.spec.ts:58` pins the invariant that makes this awkward — *"Where it goes
   travels beside the event, so a field of the event's own is never taken for it"* — with a deliberate
   `pluginId` collision case.

**What the ws adapter actually does**, read from the installed bundle
(`node_modules/@trpc/server/dist/ws-CnhJbg02.mjs`) rather than assumed, because Decision 1 rests on it:
`getWSConnectionHandler` (`:31`) creates `ctxPromise` once per connection (`:106`), calling
`createContext({ req, res: client, info })` inside it (`:50`) where `res` **is** the `ws` client; every
operation on that socket awaits that same promise (`:151`). The lazy `connectionParams` path (`:348`)
is also once per connection. So a value minted in `createContext` is per-connection by construction.

`bus.sub` (`bus.ts:41`) is the repo's only subscription and takes no input, so reading identity from
context avoids introducing a mechanism with no precedent here.

**The envelope is destructured in four places**, two of which would carry a new field silently:

| site | note |
|---|---|
| `abuddy-host/src/bus/machine.ts:184` | the main outgoing path |
| `abuddy-host/src/bus/app.ts:76` | `startEarlySystems` routes **outside** the bus machine; backend-only, so it carries no client, but it must be read to know that |
| `abuddy-host/src/features/application/fe/connection.ts:16` | the renderer's inbound tap |
| `abuddy-host/src/secrets/index.ts:80` | an emit, not a route |

Also `MessageSender = Pick<Message, 'from' | 'via'>`
(`abuddy-host/src/features/application/fe/types.ts:46`), hand-rebuilt field by field at
`features/application/fe/machine.ts:304` as `sender: { from, via }`. A `Pick` plus a hand rebuild drops a
new field with no compile error. `client` is routing rather than sender identity and should **not** join
`MessageSender`; it is recorded here because this is where the next reader will assume it did.

Measured precedent for cost: adding `via` touched 26 files and `from` 15, both **additive and
non-routing**. This field routes.

**`host` already has a participant that is not a feature.** `packages/abuddy-host/src/refs.ts` holds
`bus: resolveName('bus', HOST_PACK_ID)` with the comment *"not a feature, but spelled as one"*, beside
`application`, `packs` and `settings`.

**What this does not fix.** The terminal issue's `M3` (a reply crossing windows) is fixed. Its `T4` is
not: two `CREATE_TERMINAL`s in *one* window still collide on one slot, which is a keyed-slot problem and
stays tracked where it is.

## Decisions

Final.

1. **The client id is minted server-side, once per connection.** `createContext` keeps the adapter's
   argument and mints `client` with `randomId` (`@abuddy/sdk/utils/random-id.ts`). `bus.sub` reads
   `ctx.client`; it gains **no input**. `bus.send` stamps `ctx.client` onto what it passes
   `receiveClientEvent`, and the zod input schema does **not** accept it — so a return address cannot be
   forged, and the id dies with the socket, which is why the absent disconnect signal does not matter.
   Chosen over deriving it from the window (`main | <pluginRef>`): that is stable across a reconnect but
   costs changes in `packages/main`, preload, the renderer client and `bus.sub`'s shape, and a round trip
   does not need an address outliving its socket.
2. **`Message` gains `client?: string`**, meaning *deliver only to this connection; absent means every
   connection*. `to` stays a plain string ref. This is deliberately **not** the object-shaped target
   (`{ everyWindow: ref }`) that `docs/archive/goals/goal-plugin-inbox.md:443-446` rejected — not because
   an object target is wrong (it notes the house precedent in `sendToSystem({ role })`) but because
   *"the backend can only fan out, so its every call would carry the object form as noise"*. That shape
   stays rejected; only its premise changes. **Leave that archived doc alone** — the goals README says an
   archived doc records the code as it was — the premise change is recorded here instead. No new separator
   and no new splitter: `/` stays the one ref separator, so every existing `splitRef` gate keeps working
   untaught.
3. **The filter is server-side.** The subscription emits to a connection when `client` is absent or equals
   that connection's id. A window therefore never receives a message not meant for it, and
   `features/application/fe/connection.ts` needs no change.
4. **Stamping is inbound-to-systems only.** The bus stamps the origin onto the event it delivers to a
   system, under a framework-reserved `_origin`, overwriting whatever was there. It does **not** stamp
   outbound events, which is what keeps `outgoing-events.spec.ts:58` intact. A plugin replying to a driver
   is therefore out of scope; the driver talks to systems and systems answer.
5. **`replyTo(incoming)` is the pack-facing API**, exported from `@abuddy/sdk/events`, returning a send
   bound to that message's origin. Pack code never names an address, never reads `_origin`, and keeps
   working unchanged if it does not reply. `_origin` takes the `_` prefix that is already this repo's mark
   for a host-stamped internal (`_rootEvents`, `_sendToLocalPlugin`), so `check:specifiers` can keep packs
   off it by the underscore, as it does for those.
6. **The driver joins as `host/drive`**, a fifth entry in `refs.ts`'s `HOST` table, following `bus`'s
   precedent. Resolution gains one branch: resolve `to` to an in-process actor, else to a connection that
   has claimed that name, else `reportDrop` exactly as today.
7. **`send-scope.spec.ts` is amended, never loosened.** Its *"delivers a backend send to that plugin in
   every window"* (`:47`) is contract and must keep passing untouched; the one-connection behaviour gains
   a new case beside it.

## Phases

### Phase 1 — A connection has a name

- `packages/api/src/transport/context.ts`: `createContext` takes the adapter's argument and returns
  `{ client }`, minted with `randomId` (Decision 1). `Context` follows from the return type as it does now.
- `packages/api/src/transport/bus.ts`: `sub` reads `ctx.client`. `send` passes it to
  `receiveClientEvent`, stamped from context. Leave the input schema alone — the comment at `:18-20`
  explains why a field must be named there, and this one deliberately is not.

**Done when:** two concurrent subscriptions carry different ids; a `bus.send` on one arrives at
`receiveClientEvent` carrying that connection's id; `npm run spec -- transport` passes.
**Mutations:** make the minter return a constant — the two-connections case fails. Add `client` to the
zod input and send a forged one — the stamped-from-context case fails.

### Phase 2 — An envelope may name one connection

- `Message` gains `client?: string` (Decision 2) wherever it is declared in `@abuddy/sdk/events`.
- Carry it through `bus/machine.ts:184`. Read `bus/app.ts:76` and confirm it needs nothing, since early
  systems are backend-only; leave a comment saying so only if the code does not already make it obvious.
- Name `client` in `bus.send`'s **outgoing** path, not its input schema.
- The subscription filters per Decision 3.
- `send-scope.spec.ts` keeps its every-window case and gains a one-connection case (Decision 7).

**Done when:** both `send-scope.spec.ts` cases pass; `npm run spec -- bus` passes; `npm run compile`
passes, since `Message` is published surface.
**Mutations:** drop `client` where the outgoing path names it — the one-connection case fails while
every-window still passes. Invert the absent-means-all branch — every-window fails alone.

### Phase 3 — `replyTo`

- The bus stamps `_origin` on the event delivered to a system, overwriting any incoming value
  (Decisions 4, 5).
- `replyTo(incoming)` in `@abuddy/sdk/events` returns a send that sets `client` from `_origin`. A reply
  sent for a message with no origin (a backend-to-backend send) must behave as today's broadcast rather
  than throw.
- `check:specifiers` gains `_origin` to the host-only list it already enforces by underscore.
- `npm run api:update` for `@abuddy/sdk`; commit `etc/`. Report what moved.

**Done when:** a system handler calling `replyTo(event)({ type: 'X' })` reaches only the asking
connection; a pack source importing `_origin` fails `check:specifiers`;
`outgoing-events.spec.ts` passes **unchanged**.
**Mutations:** merge rather than overwrite `_origin` — the forged-origin case fails. Route from
`event._origin` in the bus — the routing-comes-from-the-envelope case fails.

### Phase 4 — `host/drive` is a participant

- `drive` joins `HOST` in `packages/abuddy-host/src/refs.ts` with a doc comment in the shape of `bus`'s.
- A connection claims the name; resolution gains the one branch in Decision 6.
- An unclaimed `host/drive` must still `reportDrop` with a message naming it, in the shape of the existing
  drop messages at `bus/machine.ts:173-177`.

**Done when:** `sendToSystem('host/drive', e)` from a backend system reaches the claiming connection; an
unclaimed `host/drive` reports a drop naming it; a second connection claiming a taken name is refused
rather than silently taking it over.
**Mutations:** remove the claimed-connection branch — the reach case fails and the drop case still passes.

### Phase 5 — The drive engine stops reconstructing

- `/qx` and `/tx` in `packages/abuddy-testing/src/engine/` become a `sendToSystem` plus a reply, over the
  `host/drive` claim from Phase 4.
- Delete the request-id minting, the reply-id match in `nextReply`, `MAX_SEEN_EVENTS` and the seen-events
  buffer from `engine/session.ts`. Keep the round-trip timeout: a reply can still not arrive.
- Update `packages/abuddy-testing/CLAUDE.md` and `docs/public-facing/cli.md` where they describe how the
  engine correlates answers.

**Done when:** `abuddy drive --serve` with three concurrent `/qx` calls returns three correct answers;
`engine/session.ts` contains no id matching; the engine's own specs
(`packages/abuddy-testing/tests/engine/`) pass.

## Deferred

- **Outbound stamping, so a plugin can `replyTo`.** Decision 4 scopes this out to keep
  `outgoing-events.spec.ts` intact.
- **Typed replies.** A typed `reply` needs an `answers` contract field, a codegen reader and a rebuild of
  every pack. Untyped first; revisit once Phase 5 shows what converted.
- **Deriving a durable per-window address** (`main | <pluginRef>`), per Decision 1.
- **The terminal issue's `T4`**, the one-window slot collision, which addressing does not reach.
- **The 221-row census and the per-reader guards it was to police.** Cancelled: the mechanism removes the
  need. The six existing guards in `packages/default-setup` are not this goal's to remove — the three-jobs
  section in that pack's `CLAUDE.md` says which die with which shape.

## Constraints

- Commit each phase as it finishes, in logical chunks, no attribution lines, `git diff --cached` first;
  pushing, tagging and PRs are on request only.
- No publishing, releases or triggered workflows; dry runs only.
- No real data dirs: never open, copy or modify `~/Library/Application Support/abuddy*`. E2E stays in the
  `abuddy-test` namespace, and the app is never launched outside the test env without an isolated
  `ABUDDY_USER_DATA_DIR`.
- Never kill processes by pattern. Only a PID captured at spawn or read from a pid file.
- No bare `tsc` in `packages/preload` (`packages/preload/CLAUDE.md`); no `npm install` in the example
  pack; no edits to version or release metadata.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`): don't widen or rewrap them
  to make a call site compile.
- Published packages: no `any` in the pack-facing SDK, respect the TypeScript floor, `api:update` after an
  export change and commit `etc/`. Never rewrite a recorded artifact to make a check pass — a red
  `api:stamp` is the signal working.
- Build order: `packages:build` before the CLI suite; default-setup's runtime before the api suites and
  E2E. `npm run packages:ensure` once before any fan-out.
- No backward-compat shims and no loosened assertions. Investigate a failing test rather than relaxing it.
- External packs are first-class: keep the fixture packs, the example pack and `test:packaged-authoring`
  passing.
- Keep the loop narrow: `npm run spec -- <target>` while working, the full chain once per phase at its end.
