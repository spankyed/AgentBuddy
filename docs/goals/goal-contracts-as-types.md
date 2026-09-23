> **Written in session** `a1dd708e-4765-423c-a618-93ab4b9131fb` (Claude Code, 2026-09-23). Resume it with `claude -r a1dd708e-4765-423c-a618-93ab4b9131fb`.

```
# Goal: a pack declares its contracts as types, not as phantom-carrying values

Implement docs/goals/goal-contracts-as-types.md, at or after ad1bc3894 on AS/plugin-inbox — the base its
Background was surveyed at — and after docs/goals/goal-plugin-contract.md lands, which is where
`declaredTypeOf` comes from. This goal does the same thing for systems that that one did for plugins.
Before Phase 1, confirm the base: `declaredTypeOf` exists in packages/abuddy-sdk/src/build/module-exports.ts,
`SystemSpec` in packages/abuddy-sdk/src/framework/define-system.ts still carries `_incoming` and `_outgoing`,
and `git grep -l "satisfies SystemEntry" -- '*/be/system.ts'` lists 13 files (11 default-setup, the host's
settings, the fixture's memos) — note the pathspec: `'packages/*/src'` matches nothing here and returns a
false zero. If any of that is wrong, stop and say so.
The other 14 in this doc is a different count: `defineSystem`'s call sites (those 13 plus the host's `packs`,
which takes no `satisfies`).
Read Background, Decisions, Phases and Constraints. Decisions are final: implement them, don't reopen
them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1–3 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- `SystemSpec` has no `_incoming` or `_outgoing`, `SystemEntry.spec` is no longer a `Pick<>` of phantoms,
  and `git grep "satisfies SystemEntry"` returns nothing outside `docs/archive/` — a plain default export
  works.
- `outgoingEventTypesOf` reads a `Contract` type from a feature's `be/types.ts`; its `_TYPES_UNRESOLVED`
  branch and its `annotated` hint argument are gone, and so is `eventTypeLiterals`' `annotated` parameter.
- Every feature with a system has `be/types.ts` exporting `Contract`; the host's `settings` and `packs`
  features have one too, which they don't today.
- A system's internal events no longer reach the facade: `ADD_LOG` is gone from
  tests/fixtures/external-pack/src/__generated__/deps/default-setup.d.ts.
- `defineSystem` takes one type parameter.
- npm run typecheck, schema:check, api:check (sdk), facade:check -w @app/default-setup,
  packages:build + packages:check.
- npm run test:unit, compile, build, npm test (E2E), test:external-pack; npm start boots clean.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files. Check
  `git diff --cached` first.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- keep a phantom property as a fallback path beside the type read. One reader, or the old footguns come
  back with a second way to hit them.
- widen `ExportInfo` (Decision 5). `exportOf` asks a value question and answers it correctly.
```

## Background (2026-09-23, at ad1bc3894 on AS/plugin-inbox)

`goal-plugin-contract.md` found that codegen's inability to read a declared type was **ours**, not
TypeScript's, and that lifting it turns a plugin's contract from a phantom-carrying value into a type
alias. That goal applies the finding to one reader. This goal applies it to the other, which is the larger
one, and then closes the pattern.

### What codegen asks, and how

`ModuleExports` (`packages/abuddy-sdk/src/build/module-exports.ts:14`) has exactly three readers:

| reader | reads | shape |
|---|---|---|
| `exportOf(file, name)` | whether a name exists, and whether it is a value, a type or both | legitimately a value question |
| `outgoingEventTypesOf(file)` | a system's outgoing events | **a value: the default export's `spec._outgoing`** |
| `acceptedEventTypesOf(file)` | a plugin's inbox | **a value: the `accepts` export's `_accepts`** — `goal-plugin-contract.md` |

So after that goal, one value-reading path remains, and it is the one with 14 call sites.

### The system contract today

`defineSystem` (`framework/define-system.ts:52`) takes three positional type parameters and returns an
object that is half real and half phantom:

```ts
export interface SystemSpec<TEvents, TOutgoing, TContext = {}> {
  types: { context: TContext; events: TEvents | SystemEvents };   // fed to XState's setup()
  typeOf: ReturnType<typeof safeEvents<TEvents | SystemEvents>>;  // called at runtime
  _incoming: TEvents;    // phantom, for codegen
  _outgoing: TOutgoing;  // phantom, for codegen
}
```

`_incoming` and `_outgoing` are `undefined as any` at runtime (`:63-64`). The feature then default-exports
`{ spec, machine } satisfies SystemEntry` (`logs/be/system.ts:176`), and codegen walks
`default → spec → _outgoing`.

### The two footguns, both from reading a value

`outgoingEventTypesOf` (`module-exports.ts:132`) spends most of its body defending against them:

1. **The import that didn't resolve.** A value's type reads as `any` when its import fails, so the reader
   throws `_TYPES_UNRESOLVED` with `check that its \`defineSystem\` import does [resolve], and that the
   pack's dependencies are installed`. It cannot tell a broken install from a mistake, so it says both.
2. **The annotation trap.** From the same function's error text: *"default-export the system entry declared
   with `satisfies SystemEntry` (an annotation `: SystemEntry` drops the spec's events)"*. A pack author who
   writes `const entry: SystemEntry = { spec, machine }` — the reflex — **silently loses every outgoing
   event**, because `SystemEntry.spec` is `Pick<SystemSpec<{ type: string }, { type: string }>, '_incoming' |
   '_outgoing'>` (`framework/system-utils.ts:7`) and the annotation widens the phantoms away.

   The plugin side has the identical bug with `: PluginAccepts` and defends against it with a
   `TypeFlags.Never` branch and an `annotated` hint threaded into `eventTypeLiterals`. Two readers, one
   footgun, two hand-written defences.

`satisfies SystemEntry` exists **only** to keep that widening from happening. It is not a type-safety idiom
here; it is a workaround for how codegen reads, and it has spread accordingly: 13 feature `system.ts` files,
the `abuddy add feature` scaffold (`abuddy-cli/src/commands/add`), three `docs/public-facing` pages, the root
`CLAUDE.md`, and specs in `abuddy-cli/tests/build` and `abuddy-sdk/tests/build` that assert on the error
text it produces.

### The audience that has nowhere to go

`defineSystem`'s first type parameter covers incoming **and** internal events. Features already separate
them in their own source — `logs/be/system.ts:20` declares `IncomingLogEvents` and `:24`
`LogsInternalEvents` — and then union them at the call, because the signature has one slot. The
consequence is that `ADD_LOG`, sent by a `fromCallback` child to its own parent, is published API for every
dependent pack. `goal-plugin-contract.md` defers this as its item 1 for exactly one reason: splitting it
means a fourth positional type parameter on all fourteen calls.

### The leaf already exists on the backend

Every one of the eleven default-setup features with a `be/` has `be/types.ts`, and nine of those leaves
import from `@/__generated__/*` — but only ever `ears` and `types`, which is **exactly the rule
`goal-plugin-contract.md` writes for `fe/types.ts`**: the two generated modules that don't reach
`#generated/events`. So the leaf rule is one rule for both sides, not two that happen to rhyme, and the
`check:specifiers` guard that goal adds for `fe/types.ts` extends to `be/types.ts` unchanged.

The event unions are what hasn't moved: `IncomingLogEvents`, `LogsInternalEvents` and `OutgoingLogsEvents`
are declared in `be/system.ts`, not in the leaf beside it.

Two features have no leaf at all and need one: the host's `settings` and `packs`
(`packages/abuddy-host/src/features/*/be/` holds `system.ts` and, for settings, `document.ts`, `index.ts`,
`store.ts`).

**This is the difference from the frontend.** `goal-plugin-contract.md` had to *invent* `fe/types.ts` to
break a cycle. Here the leaf is already there, already clean, and the contract simply has not moved into
it.

### Why the backend's value read works at all

All eleven default-setup `be/system.ts` files import `@/__generated__/events` — codegen reads a value out
of a module that imports codegen's own output. The frontend arrangement of the same shape failed with
`_TYPES_UNRESOLVED` (`goal-plugin-contract.md`, Spike results). The backend's does not, and the plausible
reason is that `default → spec` resolves one property whose type comes from a separate `defineSystem` call
and never requires checking the machine, where typing `definePlugin<E>({ state: machine })` requires
checking the argument.

**That has not been verified, and the goal does not rely on it.** It is recorded because it is the only
reason the current arrangement is standing. Merging the move and the reader switch into one phase (Phase 1)
is what makes it stay irrelevant: no phase ever depends on the old value read continuing to work.

## Decisions

Final.

1. **A system's contract is one exported type in `be/types.ts`.**

   ```ts
   export type Contract = {
     context: LogsContext
     incoming: IncomingLogEvents
     internal: LogsInternalEvents
     outgoing: OutgoingLogsEvents
   }
   ```

   Named fields, not positions: `internal` is a field a feature adds, not a fourth type parameter fourteen
   calls have to skip past. `incoming` and `internal` may be omitted; `context` defaults to `{}`.

   It mirrors `goal-plugin-contract.md`'s `fe/types.ts` deliberately — the same file name, the same export
   name, the same rule that codegen reads it and nothing else. A pack author learns one thing.

   **And it is named the same way**: `features[].system.contract` in `abuddy.json`, in the `"path#export"`
   shape `repositories` and `services` already use, inside the `system` object that already holds `entry`:

   ```json
   "system": {
     "entry": "src/features/logs/be/system.ts",
     "contract": "src/features/logs/be/types.ts#Contract"
   }
   ```

   Same reasons as the plugin side: the manifest names every other entry point a feature has, the schema
   validates it, a typo fails the build naming the path, and the field being optional is what lets a feature
   have a system with nothing published.

   Both leaves export a type called `Contract`, so `#generated/events` imports them under aliases. That is
   intended — one name for one concept — and the aliasing is codegen's problem, not an author's.

2. **`defineSystem` takes one type parameter and keeps its value half.**

   ```ts
   export const logsSpec = defineSystem<Contract>()
   ```

   `types` and `typeOf` stay: XState's `setup({ types })` and `spec.typeOf('ADD_LOG', event)` are real uses.
   `_incoming` and `_outgoing` are **deleted** — nothing replaces them, and no fallback path reads a phantom
   when the type read finds nothing.

   `spec.types.events` becomes `incoming | internal | SystemEvents`, so the machine still accepts everything
   it handles. Only what codegen *publishes* changes.

3. **`satisfies SystemEntry` stops being required, and goes.** Codegen no longer reads the default export's
   type, so nothing is widened by an annotation and there is nothing for `satisfies` to protect. Delete all
   14, and delete the sentence in the root `CLAUDE.md` that teaches the rule ("Systems default-export their
   entry with `satisfies SystemEntry`, which keeps the spec's events for the generated types").

   `SystemEntry.spec` becomes the spec type itself rather than a `Pick<>` of phantoms.

4. **`internal` does not reach the facade.** `OwnSystemEvents` is `incoming`; the facade's
   `PackSystemEvents` is `incoming` too; `internal` reaches the machine's own event union and nothing else.
   This is `goal-plugin-contract.md`'s Deferred item 1, taken here because Decision 1 makes it a field
   rather than a signature change.

   **Nothing changes at runtime.** A plugin's inbox is emitted as a value the app can check against
   (`plugin: { receives: [...] }`, `generate-entries.ts:550`); a system's events are type-only (`:923`, "from
   its spec; type-only, so facades carry no machines or contexts"). So narrowing `internal` out of the
   published type cannot make the bus start rejecting an event it accepts today, and no `fromCallback` child
   loses its send to its own parent.

5. **`exportOf` and `ExportInfo` do not change.** `ExportInfo.type` being a `boolean` was named as a
   self-imposed constraint in `goal-plugin-contract.md` because it was misread as an answer to "what is this
   type". It is not: `exportOf` asks whether a name exists and what kind it is, and a boolean answers that
   correctly. The fix was always a second reader, and `declaredTypeOf` is it. Widening `ExportInfo` here
   would be fixing the wrong thing.

6. **One reader, and a guard that says so.** After Phase 1, `module-exports.ts` reads no phantom property.
   A spec pins that `SystemSpec` has no `_`-prefixed members and that `module-exports.ts` contains no
   `propertyType(..., '_` call, so a future contract cannot quietly reintroduce the pattern.

## Phases

### Phase 1 — The contract type, and the reader that reads it

The move and the switch are one phase on purpose. Splitting them would keep `_incoming`/`_outgoing` derived
from `Contract` for the length of a phase — the fallback path beside the type read that the Never list
forbids — and it would weaken the check that matters: in a split, "the generated maps are byte-identical"
proves the derivation while the *old* phantom reader is still the one reading. Merged, it proves the new
reader gives the same answer as the old one did, which is the only version of that check worth running.

- Add `Contract` to each feature's `be/types.ts` (Decision 1); move `IncomingXEvents`, `XInternalEvents`
  and `OutgoingXEvents` out of `be/system.ts` into the leaf beside it.
- Create `be/types.ts` for the host's `settings` and `packs` features, which have none.
- `abuddy.json` gains `features[].system.contract` (Decision 1), with `manifest-schema.ts`,
  `generate:schema` and `schema:check`.
- `defineSystem<Contract>()` (Decision 2), 14 call sites (11 default-setup, 2 host, 1 fixture).
- `outgoingEventTypesOf(file)` takes the feature's `be/types.ts` and reads `Contract` with `declaredTypeOf`,
  then `propertyType` for `outgoing` — the same walk, one module earlier.
- Delete the `_TYPES_UNRESOLVED` branch, the `satisfies`/annotation error text, and `eventTypeLiterals`'
  `annotated` parameter. Its other caller, `acceptedEventTypesOf`, is deleted in
  `goal-plugin-contract.md`'s Phase 1 — confirm that before starting, since this goal assumes it.
- Delete `_incoming` and `_outgoing` from `SystemSpec`; `SystemEntry.spec` stops being a `Pick<>`
  (Decision 3). Remove every `satisfies SystemEntry` outside `docs/archive/`: the 13 `be/system.ts` files,
  the `abuddy add feature` scaffold, the `docs/public-facing` pages, the root `CLAUDE.md` sentence, and the
  specs in `abuddy-cli/tests/build` and `abuddy-sdk/tests/build` that assert the annotation error text —
  those specs lose their subject, so delete them rather than rewording them.
- Extend `goal-plugin-contract.md`'s leaf guard to `be/types.ts`: one rule, both leaves, since the backend
  leaves already obey it (Background).
- The guard from Decision 6.

**Done when:** `npm run typecheck`, `compile`, `schema:check`, `npm test -w @abuddy/sdk`,
`npm test -w @app/default-setup`, `test:external-pack` pass; `git grep "satisfies SystemEntry"` and
`git grep "_outgoing"` return nothing outside `docs/archive/`; `api:update` run and `etc/` committed. The
check that carries the phase: the generated event maps are **byte-identical** to before it
(`git diff --stat` on `src/__generated__/`) — the new reader reaching the same answer the phantom reader
did, off a different module. Mutation: annotating a feature's default export `: SystemEntry` still generates
its full event map, which is the trap being gone rather than moved. Second mutation: pointing the reader at
`be/system.ts` instead of the leaf fails a named spec.

### Phase 2 — The internal audience

After Phase 1.

- `internal` stops reaching `OwnSystemEvents` and the facade (Decision 4).
- Move each feature's genuinely internal events into `Contract['internal']`. `logs` and `database` already
  name theirs (`logs/be/system.ts:24`, `database/be/system.ts:34`); the other twelve need the split made.
- The fixture pack gains a `@ts-expect-error` on a send of a default-setup system's internal event.

**Done when:** `npm run typecheck`, `compile`, `test:external-pack`, `facade:check -w @app/default-setup`
pass; `ADD_LOG` is gone from `tests/fixtures/external-pack/src/__generated__/deps/default-setup.d.ts`, and
the facade is smaller than before the phase (record both line counts). Mutation: moving one event from
`internal` to `incoming` puts it back in that file.

### Phase 3 — Close the pattern

- Update `docs/public-facing/` and `packages/abuddy-sdk/CLAUDE.md` wherever they teach `defineSystem`'s
  three parameters or `satisfies SystemEntry`.
- `abuddy add feature`'s templates (`packages/abuddy-cli/src/`) scaffold `be/types.ts` with a `Contract`.
- One paragraph in `packages/abuddy-sdk/CLAUDE.md`: contracts are declared types in `types.ts`, read by
  `declaredTypeOf`; a phantom-carrying value is how it used to work and what the guard rejects.

**Done when:** the full chain passes; `abuddy add feature` in a scratch pack produces a feature that builds
with no hand edits; no doc outside `docs/archive/` mentions `satisfies SystemEntry` or `_outgoing`.

## Deferred

- **`safeEvents` and `spec.typeOf`.** They are real runtime behaviour, not a reading workaround, and stay
  as they are. **Reopen** only if XState gives a typed alternative.
- **A sender on `Message`.** `goal-plugin-contract.md`'s Deferred item 2, unchanged and untouched here.

## Constraints

- Commit each phase as it finishes, no attribution lines, `git commit -- <paths>`; check `git diff --cached`
  first. Pushing, tagging and PRs are on request.
- No publishing, releases or triggered workflows; no real data dirs; E2E in the `abuddy-test` namespace.
- No bare `tsc` in `packages/preload`; no `npm install` in the example pack; no version metadata.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- Published packages: no `any` in the pack-facing SDK, the TypeScript 5.7 floor, `api:update` after export
  changes with `etc/` committed.
- Build order: `packages:build` before the CLI suite; `compile` before the api suites and E2E. Suites don't
  run concurrently — they share the build lock and stamps.
- Investigate failing tests; mutation-check every new guard.
- External packs are first-class: `tests/fixtures/external-pack` is where the narrowed facade is proved.
- Per-phase checks are the narrow ones in "Done when"; the full chain runs once at a phase's end (root
  `CLAUDE.md`, "What to run after a change").
