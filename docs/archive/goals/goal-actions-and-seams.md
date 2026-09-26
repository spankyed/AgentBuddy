> **Done** (`AS/plugin-contract`: `576873cbe`, `9d80d94ff`, `2e51651da`). The text below is the plan as written;
> two things it did not predict are in the Outcome, and `via` ended up naming any source rather than only an
> action. For the current shape, see the root `CLAUDE.md` ("Addressing is an envelope") and
> `docs/archive/plans/host-seams.md`.

> **Written in session** `8b92798a-1d8e-4b9d-bb17-daa98bec9f93` (Claude Code, 2026-09-24). Resume it with `claude -r 8b92798a-1d8e-4b9d-bb17-daa98bec9f93`.

```
# Goal: actions send as themselves, and the host's last exception goes

Implement docs/goals/goal-actions-and-seams.md on AS/plugin-contract, at or after e806a36c3 — the base
its Background was surveyed at. It finishes docs/archive/plans/host-seams.md, whose steps 1, 2 and 5 have landed
(a07b5c095, e5580d6b4, 4d649fc0b); this goal is its steps 3 and 4 plus the docs they falsify.
Before Phase 1, confirm the base: `Message` in packages/abuddy-sdk/src/events/index.ts has `from?: string`
and no `via`; `packages/abuddy-sdk/src/services/index.ts` declares `emitter.broadcastToPlugin` as
`typeof untypedBroadcastToPlugin`; `packages/abuddy-host/src/features/packs/fe/frontends.ts` imports
`ShellPackFrontends` from `../../application/fe/public.ts`; and `HOST_SRC_ROOT` is in
scripts/check-import-specifiers.ts. If they don't, stop and say so — the plan was surveyed somewhere else.
That last file was being edited by hand when this was written, in `findContractLeafImports`, which this
goal does not touch: read it fresh rather than assuming its shape.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1-3 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- A message an action sends carries `from` (its pack) and `via` (`action:<label>`); the four sites that
  render a sender show both.
- `git grep HOST_SRC_ROOT` returns nothing, no host feature imports another feature's `fe/`, and
  `packages/abuddy-host/src/features/*/fe/public.ts` is gone.
- No doc or comment still says a send an action makes carries no sender.
- `npm run typecheck`, `npm run test:unit`, `npm run api:check`, `npm run facade:check -w @app/default-setup`,
  `npm run build`, `npm run test:external-pack`, `npm test` and `npm run test:packaged-authoring` pass.
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
- let a bare feature id compile from an action (Decision 2). The `@ts-expect-error` cases in
  abuddy-cli/tests/build/facade-typing.spec.ts are the guard; if they go unused, you broke the rule.
- give the host an `abuddy.json`, or add a table of blessed exceptions to a gate. Both were investigated
  and rejected; docs/archive/plans/host-seams.md records why.
```

## Background (2026-09-24, at e806a36c3 on AS/plugin-contract)

`docs/archive/plans/host-seams.md` has five findings and five steps. Three have landed: the `settings` designation
is gone and the app addresses `HOST.settings` (step 1); `createSends` builds every send and the host stamps
`from: 'host'` (step 2); the host's sends are typed against maps assembled from its own contracts and it
names features by bare id like a pack (step 5). What is left is steps 3 and 4.

### Actions are the last sender that cannot say who it is

`services.emitter.broadcastToPlugin` is declared `typeof untypedBroadcastToPlugin`
(`packages/abuddy-sdk/src/services/index.ts:40`) — the unbound function — and an action runs outside any
pack scope, reached through `runActionCode` (`packages/default-setup/src/extensions/steps/action/sandbox.ts:18`),
which already takes a `label` and builds `createLogger('action:${label}')`.

After steps 2 and 5, the unbound sends have exactly two users left in the repo:

| Module | Sends | Why unbound |
|---|---|---|
| `abuddy-sdk/src/services/index.ts` | 5 | the action emitter — this goal binds it |
| `abuddy-sdk/src/logger/report-error.ts` | 2 | SDK code sending on behalf of whoever called `reportError`; the caller is a logger source (`'bus'`, `'action:x'`), not a pack |

So after Phase 1 the set of senders that stamp nothing is one module, for a reason that will not change.

### `fe/public.ts` survives only in the host, for one type

It is gone from default-setup, replaced by two mechanisms rather than renamed: the contract
(`fe/contract.ts`, types only) and the readers `#generated/fe` generates. The host's three `fe/public.ts`
export runtime values and have two consumers: `abuddy-host/src/fe/index.ts:8-10` re-exports all three — the
package's own export surface, not a crossing — and `features/packs/fe/frontends.ts:7` imports the type
`ShellPackFrontends` from `../../application/fe/public.ts`, **the only cross-feature host frontend import
there is**. `ShellPackFrontends` (`features/application/fe/types.ts:12`) is a port: the shell takes it, the
packs feature implements it (`createPackFrontends(io, packs): ShellPackFrontends`). The exception in
`scripts/check-import-specifiers.ts` — `HOST_SRC_ROOT`, and the `public` branch in
`findCrossFeatureImports` — exists for that single import.

### Docs this work falsifies

- `Message.from`'s comment (`abuddy-sdk/src/events/index.ts`) says a sender is "absent … on one an action
  makes through `services.emitter`". Phase 1 makes that false.
- The root `CLAUDE.md` envelope bullet describes a message as `{ to, event, from? }`.
- `docs/goals/wont-do/goal-sender-enforced-audiences.md` records "an action's sends can't stamp" as
  objection 1 and "61 call sites can't stamp" as objection 2. Both are answered once Phase 1 lands. The
  user's decision on this, recorded in the plan's Open Questions: **update the doc, don't reassess the
  goal** — its other reasons (the snapshot-format break, designing a policy with no third-party pack in
  existence) still stand.

## Decisions

Final.

1. **An action stamps its pack in `from` and itself in `via`.** `Message` gains `via?: string`, carrying
   `action:<label>` — the form `createLogger` already uses, so a dropped send and that action's own log
   lines share a string to grep. `from` keeps one meaning: the pack. `'<pack>/<action>'` was rejected — it
   reads as `<packId>/<featureId>` and an action is not a feature, so anything parsing `from` as a ref
   would get a confident wrong answer. `via` is absent for every other sender.
2. **An action still names every feature `<packId>/<featureId>`, its own pack's included.** Binding an
   identity for the stamp must not make bare names resolve. An action is content, not source: a row a user
   edits, exports and copies into another pack, where a bare name would rebind silently. The reason is
   recorded in three places as of 8749be528; keep it true.
3. **A port lives at the seam.** `ShellPackFrontends`, and any sibling on `application/fe/public.ts:6` the
   packs feature implements, moves into `abuddy-host/src/fe/`, which both features already import from.
4. **The exception is deleted, not registered.** `HOST_SRC_ROOT` and the `public` branch go; nothing
   replaces them.
5. **The `fe/public.ts` barrels fold into `abuddy-host/src/fe/index.ts`.** They are the package's export
   surface, not the retired cross-feature door. Do not rename them `contract.ts`: a contract is type-only
   and these hold runtime exports.

## Phases

### Phase 1 — Actions send as their pack

- `Message` gains `via?: string` (Decision 1), and `createSends` takes it beside `from`.
- `services.emitter` carries a pack identity and the running action's label, threaded through
  `runActionCode` (`default-setup/src/extensions/steps/action/sandbox.ts`), which already has both.
- The four sites that render a sender append `via` when present, exactly as they append `from`:
  `abuddy-host/src/bus/machine.ts` (two drops), `abuddy-host/src/bus/client-events.ts`, and the shell's
  `features/application/fe/machine.ts` and `fe/connection.ts`. The lines read:
  `Dropped "MEMO_ADDED" sent by "default-setup" (action:summarise-thread) to the "memo-pack/memos" plugin, …`
- **Add `via` to the `bus.send` input schema** beside `from`
  (`packages/api/src/transport/bus.ts:20`), and a case to `packages/api/tests/unit/bus-send-sender.spec.ts`.
  This is not optional and it is easy to miss: that schema names its fields, and `.passthrough()` is only on
  the inner `event`, so a field it doesn't name is **silently stripped**. `from` was added to `Message`
  without it once already, which severed every renderer send's sender and left the diagnostics written to
  name one unable to (fixed in 9333f87f2). Worse, the spec's existing third case — "still drops a field
  nothing declares" — *passes* while `via` is the field being dropped, so the guard reassures you.
- Update `Message.from`'s comment and the root `CLAUDE.md` envelope bullet, and `via`'s own doc.

**Done when:** `npm run typecheck`, `npm run test:unit`, `npm run test:external-pack` pass; `api:update` run
and `etc/` committed. A pack test asserts a message an action sends carries its pack in `from` and
`action:<label>` in `via`, and one asserts a send with no action carries no `via`. The
`@ts-expect-error` cases in `facade-typing.spec.ts` still bite (Decision 2). Mutation: dropping the label
from the sandbox's binding fails a named spec; dropping `via` from a rendering site fails another.

### Phase 2 — Move the port, delete the exception

- Move `ShellPackFrontends` (Decision 3) into `abuddy-host/src/fe/`; point `features/packs/fe/frontends.ts`
  at it. Only that one moves: of the four names on `application/fe/public.ts:6`, `ShellNotify` and
  `ShellStorage` are used by the renderer and `ShellOptions` by neither feature, so they are the shell's own
  contract reaching its composer through the package barrel — which is not a crossing.
- Delete `HOST_SRC_ROOT` and the `public` branch in `findCrossFeatureImports`, and the spec case that pins
  the exception (Decision 4). Read that file fresh: it was being edited by hand in a different function.
- Fold the three `fe/public.ts` barrels into `abuddy-host/src/fe/index.ts` (Decision 5).

**Done when:** `npm run check:specifiers` passes with no exception in `findCrossFeatureImports`;
`git grep HOST_SRC_ROOT` and `git grep "fe/public"` under `packages/abuddy-host/src/features` return
nothing; `npm run typecheck`, `npm run test:unit`, `npm test` pass. Mutation: adding a cross-feature `fe/`
import in the host is reported, with no exception left to excuse it.

### Phase 3 — The invariant, and the docs that outlived their reason

- Update `docs/goals/wont-do/goal-sender-enforced-audiences.md`: its objections 1 and 2 are answered.
  Say so and say what still stands; do not reopen the goal (the user's decision).
- Update `docs/archive/plans/host-seams.md`: steps 3 and 4 landed, with the commits.
- **A spec pinning which modules send unbound.** After Phase 1 that set is one —
  `abuddy-sdk/src/logger/report-error.ts`, which sends on behalf of a caller it can't name. A spec asserting
  the set hasn't grown makes "a new sender should bind one" a failing test rather than something to
  remember, the way `import-specifiers.spec.ts` now asserts a case per `CHECKS` entry.

  **Judgement, and skip it if it turns:** this is worth building only while it stays an assertion about a
  small set with one real reason. If it starts wanting a table of excuses with a row per caller, it has
  become the thing this work has twice rejected — say so in the summary and leave it out. The docs above
  are the part of this phase that is not optional.

- **Consider letting `report-error.ts` stamp `via`.** It can't name a pack — it sends for whoever called
  `reportError` — but it is handed a `source` (`report-error.ts:24`), and a source is the same kind of
  string `via` holds: `'bus'`, or `action:<label>` from `createLogger`. Stamping `via: source` would make
  the one sender that carries no `from` still say where it came from, and the invariant becomes the
  stronger **every send carries a pack, a source, or both** rather than "one module stamps nothing".

  This widens `via` beyond what Decision 1 settled — the user chose it to name the action; this makes it
  name the source, of which an action is one. That is the same shape and a better definition, but it is a
  widening, so decide it explicitly and record it rather than letting it happen. If taken, `via`'s doc says
  "what within the sender made it" and the guard in this phase asserts the stronger invariant.

**Done when:** the full chain passes; no doc or comment says an action's sends carry no sender; if the spec
was built, a mutation adding an unbound send to a module not in the set fails it.

## Outcome (2026-09-24)

All three phases landed on `AS/plugin-contract` and the full chain passed. Two of the doc's own premises turned
out to be wrong where it counted — the exception Phase 2 deletes guarded four imports rather than one, and the
"four sites that render a sender" were five — and a review afterwards found three defects in the work, all since
fixed. `via` ended up wider than Decision 1 settled, which Phase 3 had invited as an explicit choice.

### Per phase

| Phase | Status | Evidence |
|---|---|---|
| 1 — Actions send as their pack | done | `576873cbe`. `default-setup/tests/unit/action-sandbox.spec.ts`, `abuddy-sdk/tests/services/emitter.spec.ts`, `api/tests/unit/bus-send-sender.spec.ts`. Four mutations: the sandbox's label, `senderSuffix`'s `via`, the shell's notify, the tRPC schema |
| 2 — Move the port, delete the exception | done | `9d80d94ff`. `abuddy-cli/tests/build/import-specifiers.spec.ts`. Two mutations: re-pointing `frontends.ts` at the shell's types, and dropping the published-entry exception |
| 3 — The invariant, and the docs | done; its optional spec deliberately not built | `2e51651da`. `abuddy-sdk/tests/logger/report-error.spec.ts`. Two mutations, one per `reportError` send |

### Conventional choices

Details the doc left open, decided while implementing:

- **`from` on an action's send is the pack whose runtime ran it**, not the pack that seeded the Action row. An
  `ActionEntity` records no owner the sandbox is given, and a flow's inline `mode: 'code'` action has no row at
  all, so the running pack is the only identity available on both paths.
- **The pack id reaches the sandbox from codegen**, as a new `packId` export in `#generated/ref`, rather than a
  literal in default-setup — a literal would be wrong the moment the file is copied.
- **One `senderSuffix` rather than a conditional at each rendering site**, so the wording cannot drift and a new
  sender field reaches every diagnostic at once.
- **`createSends` omits `from`/`via` when unbound** instead of stamping them `undefined`, which read as a sender
  that had been lost and put a key in every serialized message.
- **`createActionEmitter` is public, not `_`-prefixed.** Its only caller is pack code, and `check:specifiers`
  bars a pack from importing an underscored export.
- **Phase 2's replacement rule is derived, not listed:** a package may name its features' frontends from a module
  it publishes and that sits outside every feature, read from `package.json` `exports`. It fails closed.
- **`OPEN_PLUGIN` was left without a sender** when the shell's refusals were unified. Giving it one is a change to
  a published event type, so it stayed a separate decision rather than riding along.

### Corrections to the Decisions

- **Decision 1 was widened, deliberately.** It settled `via` as `action:<label>` and "absent for every other
  sender". Phase 3 offered the widening as an explicit choice and it was taken: `via` now means *what within the
  sender made it*, of which an action is one case, and `reportError` stamps the source it was handed. The
  invariant that replaces "one module stamps nothing" is **every send carries a pack, a source, or both** —
  except `services.emitter` reached outside an action, where neither is in scope.
- **Decision 4 held, but Phase 2's premise did not.** The Background says the exception exists "for that single
  import". It excused four: `features/packs/fe/frontends.ts` reaching the shell's types, *and* the three
  `fe/public.ts` re-exports in `fe/index.ts`. Folding the barrels in — which Decision 5 required — would have
  broken the gate rather than freed it. Nothing was registered in its place, as Decision 4 required.
- **"The four sites that render a sender" were five.** The shell refuses a plugin at once *and* after waiting for
  pack frontends, and the deferred one carried no sender at all.

### Open items

- **A review after this goal found three defects in it**, all fixed: the bus drop dedupe was keyed on `from`
  alone, so two actions of one pack collapsed into one report naming the wrong one (`29620c935`); the new gate
  excepted a published module *inside* a feature, which handed `host/settings` a licence no other feature had
  (`a8074ef93`); and the shell's deferred refusal named no sender (`931a4ce7c`).
- **`_sendToLocalPlugin` has no caller.** Nothing in any package's source calls it — only its own definition and
  `check:specifiers`' name list — while `packages/abuddy-host/CLAUDE.md` still describes it as the path the
  renderer's `sendToPlugin` takes. The behaviour that doc describes is right; the function it credits is not
  involved. Removing an `@internal` export was left as a separate decision.

### Invariants, and what guards each

| Invariant | Guard |
|---|---|
| A message an action sends carries its pack in `from` and `action:<label>` in `via` | `default-setup/tests/unit/action-sandbox.spec.ts` |
| A send made with no action carries no `via` | `abuddy-sdk/tests/services/emitter.spec.ts` |
| An action names every feature `<packId>/<featureId>`; a bare name does not compile and does not resolve | `abuddy-cli/tests/build/facade-typing.spec.ts` (`@ts-expect-error`), `abuddy-sdk/tests/services/emitter.spec.ts` |
| Every diagnostic naming a sender words it the same, and shows both fields | `abuddy-sdk/tests/events/envelope.spec.ts`, plus a case each in `outgoing-events`, `client-events` and `send-scope`, and one in `open-plugin` asserting the shell's two refusal branches say exactly the same thing |
| `reportError` stamps the source it was given and never a pack | `abuddy-sdk/tests/logger/report-error.spec.ts` |
| No host feature imports another feature's `fe/` | `findCrossFeatureImports` (`check:specifiers`) — with no exception for the host |
| Only a module a package publishes from outside every feature may name its features' frontends | `findCrossFeatureImports`, and three cases in `abuddy-cli/tests/build/import-specifiers.spec.ts` |
| A drop is reported once per plugin, event type **and sender** | `abuddy-host/tests/bus/outgoing-events.spec.ts` — the key is `senderSuffix`'s output, so it distinguishes whatever the report distinguishes |
| A field added to `Message` cannot be silently dropped at the tRPC boundary | the `Required<Message>` sample in `api/tests/unit/bus-send-sender.spec.ts`, which stops compiling until the new field is named. It sat in the SDK's tests until `ca8e7897d` made `npm run typecheck:be` cover this package's specs |

Milestones, true when the work landed and not properties to hold: `git grep HOST_SRC_ROOT` returning nothing
outside the docs that record the change, and `packages/abuddy-host/src/features/*/fe/public.ts` being gone. Both
are the deleted-identifier kind the README says not to guard — the property that made the old shape wrong is the
cross-feature rule above, and that is guarded.

### Final verification

`npm run typecheck`, `npm run test:unit` (9 suites), `npm run api:check`, `npm run build`,
`npm run facade:check -w @app/default-setup`, `npm run test:external-pack`, `npm test` (21 E2E) and
`npm run test:packaged-authoring` all pass. The unit and E2E suites were re-run after the review's fixes with no
other session building concurrently, since a contended run had produced four failures that each passed alone —
the build lock and build stamps are shared, as the root `CLAUDE.md` warns.

## Deferred

- **Typing an action's sends by bare name.** Decision 2 forbids it deliberately; the identity Phase 1 adds
  would make it technically possible, which is exactly why the reason is written down in three places.
- **The 80 pre-existing `--noUnusedLocals` reports in default-setup.** Real but unrelated; sweeping them
  would bury this work's diff. `packages/abuddy-host/src/secrets/index.ts` has an unused
  `getDesignated, hasDesignation` import in the same category.
- **Giving the host codegen.** `docs/archive/plans/host-seams.md` records why the host gets no manifest. Phase 2
  removes the reason that question kept being asked.

## Constraints

- The repo's standing rules (root `CLAUDE.md`): `npm run api:update` with `etc/` committed after a public
  export changes, `facade:update` when the bundled facade moves, typed EARS types are change-controlled,
  mutation-check every new guard, `tests/fixtures/*` is where a cross-pack rule is proved.
- Suites don't run concurrently — they share the package build lock and the build stamps.
- Phase 1 reaches outside the host (`abuddy-sdk`, `default-setup`), so it takes `api:update` and the pack
  suites. Phase 2 is host plus `scripts/` and its spec. They are independent and may land in either order.
