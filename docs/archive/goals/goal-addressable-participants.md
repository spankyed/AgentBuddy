> **Done through Phase 4** (master, `1bdd6c52f`..`4124945ae`). Phases 1-4 landed and are mutation-checked; Phase 5
> is deferred because its two "Done when" clauses turned out to be mutually exclusive — see the Outcome. The text
> below is the plan as written.

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

## Outcome (2026-10-04)

Phases 1-4 landed on master as four commits plus two recorded-artifact commits, with `npm run chain` green at
102.5s (12 of 28 cached). Phase 5 was not attempted: implementing it as specified would have required shipping
something whose own acceptance criteria contradict each other, which the first subsection below sets out.

The mechanism the goal was about — a named thing with an inbox that can be sent to and can answer whoever asked —
is built and guarded. What is missing is its first consumer.

### Per phase

| Phase | Status | Evidence |
|---|---|---|
| 1 — a connection has a name | done | `createContext` mints per connection; `bus.send` stamps from context. `tests/transport/context.spec.ts`, `bus-send-sender.spec.ts`. Mutations: a constant minter fails the two-connections case; accepting `client` in the schema *and* reversing the stamp's spread fails the forgery case (either alone does not — see below) |
| 2 — an envelope may name one connection | done | `Message.client`, subscription filters server-side. `packages/api/tests/transport/sub-scope.spec.ts`. Mutations: removing the filter fails the 3 addressed cases and no broadcast case; dropping the absent-means-all guard fails the 2 broadcast cases and no addressed case |
| 3 — `reply()` | done | Ambient delivery scope; `Message.sender` stamped at delivery. `packages/abuddy-host/tests/bus/reply.spec.ts` (8 cases). Mutations: not installing the async reader fails all 3 reply cases and none of the 3 refusal cases; removing `createSends`' stamp fails exactly 1 |
| 4 — `host/drive` is a participant | done | `HOST.drive`, `createParticipantClaims`, the bus's claimed-participant branch. `packages/abuddy-host/tests/bus/participants.spec.ts` (8 cases). Mutation: removing the branch fails the 3 routing cases and neither the drop case nor the 4 registry cases |
| 5 — the drive engine stops reconstructing | **deferred** | Not attempted; its criteria cannot both hold |

### Corrections to the Decisions

**Decision 4 is superseded, and the result is simpler.** It scoped `_origin` stamping to inbound-to-systems so
that `outgoing-events.spec.ts`'s "exactly as sent" invariant survived. The chosen mechanism makes the question
moot: the origin lives in an ambient delivery scope and **nothing is stamped onto any event**, so no reserved key
exists, no event can carry a forged one, and that spec is untouched by construction rather than by scoping. There
is no `_origin`.

**Decision 5's `replyTo(event)(…)` became an argument-free `reply(…)`**, and the reply's target comes from
`Message.sender` rather than from the handler naming a plugin. Both were settled with the user mid-implementation
after the original shape was found to need something the envelope does not carry. The mechanism is
`AsyncLocalStorage` on the backend and a synchronous holder in the renderer, behind one SDK interface
(`events/delivery.ts`), because `@abuddy/sdk/events` is bundled into pack frontends and a browser has no
equivalent.

**`sender` is accepted from the wire; `client` is not.** This looks like an inconsistency and is not. Every caller
already holds the API token, which lets it send anything to anything, so a forged `sender` is a bug rather than an
escalation — and the client is the only party that knows which of its plugins asked. `client` is withheld because
the server knows it for free, so taking it from the wire would be strictly worse for nothing.

**`Message.sender` is not `MessageSender`.** `MessageSender = Pick<Message, 'from' | 'via'>` predates this and
means "who to name in a diagnostic". The new field means "where to send an answer". The collision was noticed and
left alone: the user chose the field name, and renaming the older type was out of scope.

**Claims are keyed by `string`, not `FeatureRef`.** `FeatureRef` is branded and "made only by `resolveName`", so
narrowing a client-supplied string into one would defeat the brand at the exact boundary it exists to guard. The
ref grammar is checked in `bus.claim`; the registry stores a string.

### Why Phase 5 cannot be built as written

Its "Done when" asks for both *"three concurrent `/qx` calls returning three correct answers"* and *"`session.ts`
contains no request-id matching"*. Those exclude each other.

**Addressing answers which connection, not which request.** Three concurrent queries from one driver produce three
replies with identical envelopes — `{ to: 'host/drive', client: <the driver> }` — distinguishable only by payload.
Per-request correlation cannot be derived from a per-connection address. The alternatives are a distinct claimed
name per in-flight request (refs are `host/<featureId>`, so that means inventing `host/driveA`) or serialising the
calls, which is the queue `26445e468` replaced.

This is the same distinction the Deferred section already drew between the terminal issue's `M3` and `T4`. It was
written there about one feature's keyed slot and applies to the engine identically; the plan did not notice that it
also invalidates Phase 5's own criteria.

**Two further obstacles, found by reading the engine rather than by reasoning about it:**

- **The driver is not a bus client.** `/qx` runs `page.evaluateWith` → the *renderer's* `untypedSendToSystem`, so
  the send comes from the window. Making the driver a participant in its own right means giving `@abuddy/testing`
  a tRPC/ws client — new dependency surface in a package every pack's tests load.
- **A plugin's own sends are not stamped.** `deliverPluginEvents` wraps only what the *shell* routes. A UI-triggered
  send (`usePlugin().send(…)` → an action → `sendToSystem`) runs outside any delivery, so it carries no `sender`
  and `reply()` would throw for it. Closing that means wrapping what `usePlugin` returns, which is pack-facing API
  used in every component — a scope expansion this goal did not authorise.

### Open items

1. **Phase 5, re-specified.** The honest version keeps a request id for concurrency and takes the real win:
   replies arrive *addressed*, so a person using the Database plugin no longer collides with a driving session and
   the engine stops reading a firehose of unrelated events. Worth doing; needs the criterion rewritten first.

   **The blocker is one thing, and it is smaller than it looks.** Checked rather than assumed: `@abuddy/sdk/events`
   is shared to the page wholesale (`SDK_FE_MODULES`, `globalKey: 'sdkEvents'`), so `reply`, `_runDelivery` and
   `_currentDelivery` are all reachable at `window.__abuddy.sdkEvents`. A driving script can therefore stamp a
   sender today, with no new dependency, by wrapping its send:

   ```js
   window.__abuddy.sdkEvents._runDelivery({ receiver: 'host/drive' }, () =>
     window.__abuddy.sdkEvents.untypedSendToSystem('default-setup/database', { type: 'EXECUTE_QUERY', code }))
   ```

   That message carries `sender: 'host/drive'`, so the system's `reply` addresses its answer there. What is still
   missing is the **claim**: with nothing holding `host/drive`, `notify` drops the answer, because no pack declares
   it as a plugin. `bus.claim` is a tRPC procedure over the WebSocket, and the driver has no client — it drives the
   page. So Phase 5 needs either a ws client in `@abuddy/testing` (a new dependency in a package every pack's tests
   load) or the claim made from the page, which needs the window's client reachable there and today it is not.

   **And the connection costs no dependency**, which was asserted the other way here first and then measured.
   Node has had a global `WebSocket` since 22 and this repo requires 23;
   `tests/e2e/app-integration/api-access.spec.ts:11` already opens an authenticated socket with
   `new WebSocket(url, ['abuddy', 'abuddy-token.<token>'])` and imports nothing. So a driver needs tRPC's
   JSON-RPC frames over a socket the repo already opens — roughly a hundred lines — rather than `@trpc/client`
   (1.0M, 146 files, and a `@trpc/server` peer) or `ws` (192K, redundant on Node 23).

   What is left for whoever picks this up is therefore smaller than it looked: the stamping half is free, the
   connection is free, and the one thing addressing still cannot do is tell two concurrent requests apart — so a
   request id stays.
2. ~~**Stamp a plugin's own sends**~~ — **done**, after this Outcome was first written. `usePlugin` hands back the
   actor with its `send` run inside a delivery naming that plugin (`abuddy-sdk/src/fe/plugin-send-scope.spec.ts`),
   so a component's send stamps `Message.sender` and `reply` answers it. The risk recorded against this — that a
   Proxy over the actor would break `@xstate/vue`'s reactivity — was **asserted and then measured false**:
   `useSelector` follows a change through the wrapper, `subscribe` and `getSnapshot` are unaffected, and the one
   real obstacle was that `actor.id` had to be the ref, which it is because the shell spawns a plugin with its ref
   as both `id` and `systemId`. The lesson is the obvious one: the claim cost a paragraph of documentation and the
   check cost one throwaway spec.
3. ~~**A reply to a *system*.**~~ — **done**, and this item was wrong twice. It said `reply` "throws rather
   than guessing"; there was no such check, so an answer to a system went out on the plugin path. That is not a
   silent loss either: a feature's system and plugin share one ref, so for any asker that also has a plugin —
   the common case — the private answer was delivered to that plugin **in every open window**, which is the
   failure `reply` exists to prevent. Found by review rather than by a case, because nothing in the repo asks a
   system and replies, and because `reply.spec.ts` asserted the broadcast as correct ("the answer is then for
   every window, as before").

   `reply` now routes on `Message.client`: present means the asker is on a connection and the answer goes out
   to that one, absent means the ask came from the backend and the answer goes **in**, to the asking system.
   The decision recorded here — refuse rather than support — was reversed deliberately, because a handler whose
   behaviour depends on who asked is the thing `reply` was built to remove. **The ref cannot make this
   decision**, which is why routing on it was tried and abandoned: `systemIds()` and `pluginIds()` both hold
   feature refs and are not disjoint. The harness gained a `client` on `app.send` so a spec can stand for a
   window rather than only for a system.
4. **Typed replies.** Still deferred, as the plan said: an `answers` contract field, a codegen reader and a rebuild
   of every pack.

### Final verification

| Check | Result |
|---|---|
| `npm run chain` | passed, 102.5s, 12 of 28 cached |
| `npm run typecheck` | 18 of 18 legs |
| `npm run spec -- bus`, `-- transport` | passed |
| `npm run compile` | passed (`facade:check` included) |
| `npm run packages:build` + `packages:check` | passed |
| `npm run api:update` (`@abuddy/sdk`, `@abuddy/ui`) | `etc/` committed; the published surface gained `reply`, `Message.sender`, `Message.client` and four `@internal` `_`-prefixed delivery members, and nothing else |
| `send-scope.spec.ts`, `outgoing-events.spec.ts` | pass **unmodified** — neither was loosened, and `outgoing-events` needed no new case |
| `npm run spec-cost:update` | 11 specs recorded, 4 of them this goal's |

One check in Phase 1's plan was wrong and is worth recording: *"add `client` to the zod input and send a forged
one"* does **not** fail the forgery case on its own, because the stamp is applied as `{ ...input, client:
ctx.client }` and overwrites whatever survived. Nor does reversing the spread on its own. The case fires only when
both are undone, so it guards the property rather than either mechanism, and the spec says so where a reader will
find it.

A second: Phase 2's planned mutation *"drop the `client` field from the zod schema"* does not apply at all — the
outgoing path has no schema, the subscription emits the object directly.

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
