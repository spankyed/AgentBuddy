> **Done and closed.** Implemented in `85960abb9`: `npm run typecheck` borrows `api:check` and
> `facade:check` from `CHAIN_STEPS`, `abuddy facade-report` takes `--skip-generate`, and codegen is a second
> ordered prerequisite. Stale both reports and typecheck exits 1 naming `api:update` and `facade:update`;
> before, it exited 0. The three incidental findings below are closed too. The text after this is the plan as
> written, with two corrections the work found.
>
> **The first is where the declarations live.** The plan put `ARTIFACT_CHECKS` and `CODEGEN` in
> `typecheck-legs.ts`; they are in `typecheck-jobs.ts`, outside the files `record-seconds` scans. Its locator
> finds `name: '<step>'` and then the next `seconds:`, so an entry carrying a name and no cost of its own
> silently lands on a neighbouring leg's span — `planSecondsEdits` refused exactly that, which is the only
> reason a wrong number was not written into the cost table.
>
> **The second is a defect the ordering question surfaced**, unrelated to artifacts: the runner weighed every
> leg at one core while `api:check` wants four, so a ten-core budget admitted thirteen cores of work. It is
> `coresFor` now — the two-schedulers-with-different-weights problem `scripts/typecheck.ts`'s header exists to
> describe, being paid by the legs as well.
>
> Measured 2026-10-08: the wall 18.0s to 19.9s (median of 3, 19.7-21.1s) for ~17s of added work, the pool
> absorbing nearly all of it. **It buys a faster red, not a thing that was broken** — the chain caught both
> reports before, so nothing shipped stale; what changes is that you find out from the command you already
> run, and that `typecheck:pack` stops compiling generated code that no longer matches the manifest.

# `npm run typecheck` notices every recorded artifact

**Prompted by:** 2026-10-08, hitting the trap often enough to be worth removing

## The trap, demonstrated

Make both recorded reports stale and ask the three commands:

```
packages/default-setup/etc/pack-types.api.md  + one line
packages/abuddy-sdk/etc/index.api.md          + one line

npm run typecheck     -> exit 0
npm run facade:check  -> exit 1
npm run api:check     -> exit 1
```

So you can change a pack's public types, run the command you were going to run anyway, see it pass, and learn
nothing. The guide warns about it at [`CLAUDE.md:122-127`](../../../CLAUDE.md) — *"it is easy to finish a
typecheck and believe every recorded artifact is current"* — which is the tell that it is a known trap rather
than a surprise. A warning in a guide is the weakest available fix for something a command could answer.

**Four recorded artifacts, split two and two.** `exports:check` (`@abuddy/ui`'s exports map) and
`schema:check` (the SDK's manifest schema) are `TYPECHECK_LEGS` entries, so `npm run typecheck` catches them.
`api:check` (three packages' `etc/*.api.md`) and `facade:check` (the pack's `etc/pack-types.api.md`) are chain
steps, so it does not. Closing both is what deletes the warning; closing one only shortens it.

## The shape: include them, do not move them

**The obvious move — make them `TYPECHECK_LEGS` entries — is a net loss, and that was measured rather than
guessed.** `api:check` as a leg would need five hand-written fields on a table whose whole purpose is deriving
them from the script (twelve of its seventeen entries declare nothing): an explicit `scope`, because its root
script hides its `-w` calls inside a module and `scopeOf` throws otherwise; a new `Leg.timeout`, because
`POOL_WIDTH['api:check']` exists so `rungForKind` says `suite` while every leg gets `quick`, which fails
`chain-graph.spec.ts`'s *"declares the rung its work implies"*; a `cores` pass-through, because it wants four
and the runner weighs every leg at one; a new `Leg.excludeSuffixes`, or it keys on every compiled `.js`,
`.map` and `.css` in three `dist` trees; and eight `scripts/` paths in `alsoReads`, a field documented for
*"files that belong to no workspace"* and currently holding two.

It would also undo the 2026-10-05 narrowing of that step wholesale: **nine declared inputs lost**, six of them
with nothing to catch it (`api-reports.ts`, `component-contracts.ts`, `api-entries.ts` and the two
`tsconfig.api-extractor.json` files are spawned through npm, not imported, so the import-closure check cannot
see them) — each added for a recorded defect, per `chain-steps.ts:1000-1007`. Plus sixty over-declared ones,
and a `packages:check` mutex that narrowing specifically removed.

**So: neither check moves.** `scripts/typecheck.ts:84` builds its step list as
`TYPECHECK_LEGS.map((leg) => ({ ...leg, dependsOn: … }))`. It gains the recorded-artifact chain steps, pulled
from `CHAIN_STEPS` by name, which already carry their own `timeout` and whose width `coresFor(name)` gives.

```ts
// scripts/typecheck.ts, sketch
const ARTIFACT_CHECKS = ['api:check', 'facade:check'] as const;
steps: [
  ...TYPECHECK_LEGS.map((leg) => ({ ...leg, cores: coresFor(leg.name), dependsOn: leg.name === ENSURE ? [] : [ENSURE] })),
  ...ARTIFACT_CHECKS.map((name) => stepAsLeg(CHAIN_STEPS.find((s) => s.name === name)!)),
],
```

**What that buys over the move:** both keep their hand-written inputs, their `excludeSuffixes` and their
narrow keys; `dep-files.integration.spec.ts` stays honest, with both still in `byNothing` rather than credited
with a `.tsbuildinfo` that `typecheck:pack` wrote; `chain-table`'s *"the chain runs every artifact's check"*
is untouched because they are still steps; and **no spec-held figure changes at all** — the leg count stays 17
and the declared sum 65.1s, so `CLAUDE.md:388-389` needs no edit.

**It also fixes a live gap found on the way.** `scripts/typecheck.ts` weighs every leg at one core
(`chain-schedule.ts` reads `step.cores ?? 1`), so a ten-core budget admits ten legs — and `api:check` alone
wants four. That is the two-schedulers-with-different-weights defect that runner's own header exists to
describe, and `cores: coresFor(leg.name)` closes it for the legs as well.

## The one half that needs code: `facade:check` must not write while the pool runs

It calls `generateEntries([])` (`packages/abuddy-cli/src/commands/facade-report.ts:42`), whose `outDir` is
`<pack>/src/__generated__` (`generate-entries.ts:108`) — the tree `typecheck:pack`'s `vue-tsc` compiles and
that `check:specifiers` and `lint:check` walk. `computeInputsHash` covers **every file under `src/`**, because
codegen reads pack sources (a system's events come from its `be/contract.ts`), so any source edit makes the
barrel stale and the write fire. In a pool beside repo-wide readers that is a race.

**The fix is a flag the build already has, plus one more ordered step.**

`abuddy build` takes `--skip-generate` (`build.ts:104`). Give `facade-report` the same flag, and have the
runner regenerate *before* the pool starts — the shape `packages:ensure` already is. The pool then invokes
`facade:check --skip-generate` and the check writes nothing.

```
npm run typecheck
  packages:ensure                     (ordered, writes — builds what the rest read)
  abuddy generate-entries -w pack     (ordered, writes — regenerates what the rest read)
  then all 17 legs + api:check + facade:check --skip-generate, concurrently, none of them writing
```

**What this avoids building:** an output directory parameter on `generateEntries`, an entry directory
parameter on `bundlePackTypes`, a `<pack>/src/.facade-check/` tree, a `.gitignore` entry for it, a case
pinning that codegen into two directories stays byte-identical, and a 1.6s first-run cost. That design was
drafted and is not needed.

**And it is better, not only cheaper, in two ways:**

- **`typecheck:pack` stops compiling stale generated code.** Today `npm run typecheck` runs `vue-tsc` over
  whatever is on disk; with codegen ordered first it checks current code. Nothing to do with the facade, and
  it was invisible until the ordering question came up. (The chain is already right here — `typecheck:pack`
  depends on `compile`.)
- **The tested capability survives untouched.** No flag still regenerates, so
  `facade-report.integration.spec.ts`' *"follows an edit to the pack's own sources, with nothing rebuilt"*
  keeps passing unchanged. The read-only rewrite tried on 2026-10-08 failed precisely because it broke that
  case; this sidesteps it rather than fighting it.

**The cost, plainly.** `npm run typecheck` goes from one thing writing before the checks start to two. It
gets ~0.3s slower normally and up to 1.6s when generated code is actually stale, and it regenerates the
pack's generated code as a side effect — gitignored (`packages/default-setup/.gitignore:3`), so `git status`
stays clean. The sentence in `typecheck-legs.ts` that makes running seventeen checks at once safe — *"The one
ordering constraint: every other leg reads what it builds"* — becomes two constraints. That is the whole of
it: the ordering is what makes a writer safe, and the second writer has the same ordering as the first.

**Left as-is deliberately:** the chain's own `facade:check` step keeps regenerating, because it depends on
`compile` and so the regenerate is already a no-op there. Passing it the flag too would also remove the
undeclared write documented at `scripts/lib/chain-steps.ts`'s step comment — a one-word follow-up, not needed
for this.

## Order of work

1. **`api:check` into the typecheck runner**, with the `cores` fix. Nothing else changes; `npm run typecheck`
   starts catching a stale `etc/*.api.md` the same day.
2. **Re-measure the typecheck wall.** `CLAUDE.md:388-389` records 65.1s of work in 18.0s. The work figure is
   the legs' declared sum and does not move, but the wall will: `api:check` is 6.9s of mostly-parallel work
   wanting four cores. Only the wall needs re-measuring, and it is a measurement, so it can only be re-measured.
3. **`--skip-generate` on `facade-report`**, and the ordered codegen step in the runner.
4. **`facade:check --skip-generate` into the runner**, then **delete the warning** at `CLAUDE.md:122-127`,
   which is only correct once both are in.

## What it costs

- **`npm run typecheck` gets slower**, by less than the 9.6s the two checks cost alone: both are
  parallelisable and the pool has headroom at 18.0s wall against 65.1s of work. Measure, do not assume.
- **Two names in a list in `scripts/typecheck.ts`** that nothing derives. Worth a case asserting the list is
  exactly the `*:check` chain steps over a recorded artifact, so a fifth artifact cannot be added without
  landing here.

## Incidental findings, worth fixing while nearby

- **`packages/*/.temp` is kept out of the root `oxlint .` walk only by oxlint's hidden-directory default.** The
  per-package `.gitignore` files list `.temp/`, but the root `.gitignore` — which is what `--ignore-path`
  reads — does not. Measured: `oxlint packages/abuddy-sdk` reports 221 files, `oxlint packages/abuddy-sdk/.temp`
  reports 144 more with 17 errors, and the root run sees neither. Adding `.temp/` to the root `.gitignore`
  would rest it on a declaration instead of a tool default.
- **`CLAUDE.md:651` cross-references a heading that does not exist** (*"api:check is not a chain step"*,
  renamed when it became one). Pre-existing.
- **`scripts/api-reports.ts:48` calls `mkdirSync(reportFolder)` unconditionally**, so `api:check` creates an
  empty `etc/` where none exists. Harmless, but it is the one write it makes outside a dot-directory and a
  one-line guard would make *"the check writes nothing"* literally true.

## Verification

```bash
# the trap is gone — the whole point, and the first thing to check
printf '\nexport type X = never;\n' >> packages/default-setup/etc/pack-types.api.md
printf '\n// x\n' >> packages/abuddy-sdk/etc/index.api.md
npm run typecheck            # must FAIL, naming facade:update and api:update
git checkout -- packages/default-setup/etc packages/abuddy-sdk/etc

npm run spec -- typecheck-legs     # the leg count and declared sum are unchanged — confirm
npm run spec -- dep-files          # both checks still honestly in byNothing
npm run spec -- chain-graph        # neither step's rung moved
npm run chain                      # green, and no step lost an input
npm run measure -- --runs 3 "npm run typecheck"   # the new wall, for CLAUDE.md:388
```

**Mutation checks:**

| mutation | expected single failure |
|---|---|
| drop `api:check` from the runner's list | the trap case above passes again, i.e. typecheck goes quiet on a stale report |
| drop `facade:check` from the runner's list | the trap case passes again for the pack's report |
| have the runner pass no `--skip-generate` | the check regenerates mid-pool; `--cores 1` is how to see it is ordering and not luck |
| remove the ordered codegen step | a stale barrel reaches `typecheck:pack`, which compiles it without complaint |
