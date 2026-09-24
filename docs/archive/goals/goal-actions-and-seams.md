> **Done** (`AS/plugin-contract`: `576873cbe`, `9d80d94ff`, `2e51651da`). The text below is the plan as written;
> two things it did not predict are in the Outcome, and `via` ended up naming any source rather than only an
> action. For the current shape, see the root `CLAUDE.md` ("Addressing is an envelope") and
> `docs/plans/host-seams.md`.

> **Written in session** `8b92798a-1d8e-4b9d-bb17-daa98bec9f93` (Claude Code, 2026-09-24). Resume it with `claude -r 8b92798a-1d8e-4b9d-bb17-daa98bec9f93`.

```
# Goal: actions send as themselves, and the host's last exception goes

Implement docs/goals/goal-actions-and-seams.md on AS/plugin-contract, at or after e806a36c3 — the base
its Background was surveyed at. It finishes docs/plans/host-seams.md, whose steps 1, 2 and 5 have landed
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
  and rejected; docs/plans/host-seams.md records why.
```

## Background (2026-09-24, at e806a36c3 on AS/plugin-contract)

`docs/plans/host-seams.md` has five findings and five steps. Three have landed: the `settings` designation
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
- Update `docs/plans/host-seams.md`: steps 3 and 4 landed, with the commits.
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

## Outcome

All three phases landed: `576873cbe` (actions send as their pack), `9d80d94ff` (the port moves, the exception
goes), `2e51651da` (`via` widens, and the docs). The full chain passes.

Two things the plan did not predict, and one thing it deliberately left open:

- **Phase 2's exception was load-bearing for the package barrel, not only for one import.** `HOST_SRC_ROOT`
  excused four imports: `features/packs/fe/frontends.ts` reaching the shell's types, *and* the three
  `fe/public.ts` re-exports in `fe/index.ts`. So folding the barrels in — which Decision 5 required — would have
  broken the gate rather than freed it. Decision 4 still holds as written: nothing was registered. What replaced
  the exception is a corrected predicate, not a list — a package may name its own features' frontends from the
  module it publishes (`package.json` `exports`), which is the hand-written counterpart of a pack's generated
  `pack-entry-fe.ts`. It fails closed: a tree with no `exports` excepts nothing, which is the opposite of the
  fail-open shape the deleted comment warned against.
- **`via` names a source, not specifically an action.** Phase 3 offered this as a decision to take or leave; it
  was taken. `reportError` is handed a source and no pack, and a source is the same kind of string
  `action:<label>` is, so it stamps `via` and the field means "what within the sender made it". The invariant is
  then **every send carries a pack, a source, or both**, except `services.emitter` reached outside an action.
- **The spec enumerating unbound senders was not built**, which Phase 3 explicitly permitted. After the widening
  the set is one entry with one reason; a spec asserting it would be a list to maintain rather than an invariant
  to check. What each sender stamps is pinned where that sender is tested (`define-events.spec.ts`,
  `emitter.spec.ts`, `report-error.spec.ts`, `action-sandbox.spec.ts`).

### Invariants, and what guards each

| Invariant | Guard |
|---|---|
| A message an action sends carries its pack in `from` and `action:<label>` in `via` | `default-setup/tests/unit/action-sandbox.spec.ts` |
| A send made with no action carries no `via` | `abuddy-sdk/tests/services/emitter.spec.ts` |
| An action names every feature `<packId>/<featureId>`; a bare name does not compile and does not resolve | `abuddy-cli/tests/build/facade-typing.spec.ts` (`@ts-expect-error`), `abuddy-sdk/tests/services/emitter.spec.ts` |
| Every field of `Message` beside `event` crosses `bus.send` | `api/tests/unit/bus-send-sender.spec.ts` — a case per field. Its "drops a field nothing declares" case is *not* the guard: it passes while the dropped field is one the envelope declares |
| The four diagnostics naming a sender word it the same, and show both fields | `abuddy-sdk/tests/events/sender-suffix.spec.ts`, plus a case each in `outgoing-events`, `client-events` and `send-scope` |
| `reportError` stamps the source it was given and never a pack | `abuddy-sdk/tests/logger/report-error.spec.ts` |
| No host feature imports another feature's `fe/` | `findCrossFeatureImports` (`check:specifiers`) — with no exception for the host |
| Only what a package publishes may name its features' frontends | `findCrossFeatureImports`, and two cases in `abuddy-cli/tests/build/import-specifiers.spec.ts` |

Milestones, true when the work landed and not properties to hold: `git grep HOST_SRC_ROOT` returning nothing
outside the docs that record the change, and `packages/abuddy-host/src/features/*/fe/public.ts` being gone. Both
are the deleted-identifier kind the README says not to guard — the property that made the old shape wrong is the
cross-feature rule above, and that is guarded.

## Deferred

- **Typing an action's sends by bare name.** Decision 2 forbids it deliberately; the identity Phase 1 adds
  would make it technically possible, which is exactly why the reason is written down in three places.
- **The 80 pre-existing `--noUnusedLocals` reports in default-setup.** Real but unrelated; sweeping them
  would bury this work's diff. `packages/abuddy-host/src/secrets/index.ts` has an unused
  `getDesignated, hasDesignation` import in the same category.
- **Giving the host codegen.** `docs/plans/host-seams.md` records why the host gets no manifest. Phase 2
  removes the reason that question kept being asked.

## Constraints

- The repo's standing rules (root `CLAUDE.md`): `npm run api:update` with `etc/` committed after a public
  export changes, `facade:update` when the bundled facade moves, typed EARS types are change-controlled,
  mutation-check every new guard, `tests/fixtures/*` is where a cross-pack rule is proved.
- Suites don't run concurrently — they share the package build lock and the build stamps.
- Phase 1 reaches outside the host (`abuddy-sdk`, `default-setup`), so it takes `api:update` and the pack
  suites. Phase 2 is host plus `scripts/` and its spec. They are independent and may land in either order.
