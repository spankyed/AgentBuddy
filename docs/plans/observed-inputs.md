# Observe the inputs

`goal-one-action-cache.md` derived the chain's *consequences* — ordering, mutexes, classification — from
what each step declares it reads and writes. It left the *premise* hand-written: `inputs` is still a
literal on every step, and everything else is a function of it.

This is the follow-up: make the premise observed rather than asserted, and remove the one blunt input that
makes every key coarser than it needs to be.

## Where it stands (2026-10-01, at `dea84c15a` on `AS/one-action-cache`)

Per-step input verification, counted:

| checked by | steps |
|---|---|
| a dep file — the compiler reports what it read | 15 |
| the module graph — `suite-reads` walks the specs | 3 |
| **nothing per-step** | **11** |

The eleven are `packages:check`, `compile`, `test:external-pack:contract`, `typecheck:fe`,
`typecheck:main`, `typecheck:preload`, `build:app`, `test:external-pack:app`, `test:smoke`, `test`,
`test:packaged-authoring`.

They are not unchecked — `chain-inputs` holds every tracked file to being *some* step's input — but that
is a coverage question. It cannot catch a step declaring too little, which is the failure that produces a
green run over work that changed. So the premise everything derives from is verified for 18 of 29 steps.

## 1. `package.json` is in all 29 steps' inputs, and need not be

`ROOT` puts `package.json` and `package-lock.json` into every step, and the root vitest configs with them.
It is a blunt proxy for *the command this step runs*, written when a step's command had no other
representation. The root `CLAUDE.md` already concedes the cost: *"Correct, and the reason a one-word
change to an unrelated script costs a full run."*

Measured over the last ~587 commits:

| | commits |
|---|---|
| touched `package.json` | 37 — **all 37 scripts-only**, no dependency field changed |
| touched `package-lock.json` | 8 |
| touched the root vitest configs | 5 |

Thirty-seven times, an npm-script edit invalidated all 29 steps: a full chain against a 2.5s warm run.

**It is an artifact because the precise answer became computable in the meantime.** Every step is one root
npm script, and `reachableText(step.name, rootScripts())` (`scripts/lib/npm-scripts.ts`) returns that
command's text and the files it reaches. Two checks already use it, and its workspace resolution was
fixed while making the typecheck legs into steps — before that it expanded `npm run X --workspace Y` as
the root's `X`, which is why nobody could have keyed on it.

**The work.** Replace `package.json` in `ROOT` with, per step, the text its command reaches. Keep
`package-lock.json`: 8 commits is real, and a dependency change does affect everything. Keep the
`workspaces` field some other way — it decides what a workspace is (`PACKAGE_DIRS`), so it is a genuine
global input even though the rest of the file is not. Give the root vitest configs to the vitest steps
only.

**Done when** an edit to one npm script re-runs only the steps whose reachable command text changed,
proved by a case that mutates a script and asserts which steps go stale — and `chain --dry` after editing
an unrelated script reports the rest cached.

**The risk worth naming.** This makes a cache key depend on a text walk of shell, which is the thing
`check:tiers` is criticised for elsewhere in these docs. The difference is that a wrong *scan* reports a
false finding and a wrong *key* is silent. So the key must be the union of the command text **and** the
files that text names, never a parse of what the command means — and the case above is what holds it.

## 2. Two tsconfig lines take the dep-file gate from 15 steps to 17

`typecheck:main` and `typecheck:preload` set no `tsBuildInfoFile`, so they report nothing and their
declared inputs rest on reasoning. Every other compiler leg writes one into
`node_modules/.cache/tsbuildinfo` and is checked against it by `dep-files.integration.spec.ts`.

`typecheck:fe` is the third uncovered one and is **not** this cheap: the renderer writes three build infos
under `packages/renderer/node_modules/.tmp` and they record no program at all — no `fileNames` key,
because a solution-style config records its references and the referenced configs do the compiling. A
case pins that, so it fails if they ever grow one.

**Done when** `dep-files.integration.spec.ts`'s uncovered list is `['typecheck:fe']` alone.

## 3. The eleven that no tool reports on

The remaining steps are builds, shell scenarios and Playwright runs. No compiler reports their reads and
no module graph reaches them, so the only honest options are:

- **Watch the process.** What a run opened is observable, and the plan's out-of-scope note argues against
  syscall tracing ("cannot tell 'read because it matters' from 'stat'd during module resolution"). That
  objection is about using a trace as a *key*; using it to check a declaration is a different claim and
  the one worth re-examining.
- **Make the step produce its read set.** `--listFiles` already does this for one shell script
  (`tests/scripts/test-packaged-authoring.sh`), which is the existing precedent.
- **Accept it, and say so per step.** A step whose inputs nothing can check is a known gap, and naming
  the eleven is better than a count that drifts.

**Settle which before building anything**, and prefer the third for any step where the first two cost more
than the staleness they would catch.

## 4. `seconds` is 29 hand-recorded measurements with no update path

It breaks the repo's own naming rule — *"an artifact with only an update is one nothing will notice has
gone stale"* — and it has neither half. The chain already measures every step and reports drift against
the table, so the measurement exists; it is the recording that is manual.

This was settled during `goal-one-action-cache.md` as *keep it in the table*, with an explicit revisit
condition of **~47 actions**, on the grounds that 13 entries are read by whoever opens the step they
describe. **That condition is half met**: the table went from 13 to 29 in one change, and the plan it
serves targets 47. Re-read that decision rather than inheriting it.

If it moves, it takes `spec-cost.ts`'s band machinery — hysteresis, `DRIFT_SHARE`, the contention refusal
— and not its storage, which is the same conclusion reached for the same reason the first time.

## 5. Open regression inherited from the goal

The warm chain is **2.5s against the base's 1.5s**, both at 80% idle on 2026-10-01. The cause is the stamp
store: 7.8MB across 28 steps, because a stamp records every input file's digest and four repo-scoped legs
write ~465KB each. The fix separates the stale *verdict*, which needs one hash, from the
which-file-changed *diagnostic*, which needs the map — a change to the stamp format and `STAMP_VERSION`.

**Check before starting: this may already be done.** Work was in flight on `scripts/chain.ts` and
`packages-built.ts` on 2026-10-01 sharing one freshness sweep across callers with a `forget` on each
step's declared writes, which is the same area.

## Named, and deliberately not proposed

**`spec-cost` moves a spec between halves by telling you to rename the file**, so a spec's filename encodes
its measured runtime. That is an artifact of vitest selecting by glob, and deriving each config's
`include` from the cost records would remove it. It is left alone because the rename has a real virtue:
the half is visible in the path and in review, where an `include` list is visible in neither. A genuine
trade rather than a free one, and it should be taken only if something else needs the glob gone.

## Out of scope

- Adopting a build tool. `one-action-cache.md`'s reasoning stands and nothing here changes it.
- Gradle's "undeclared means uncacheable". It has no subject here: 23 of 29 steps are verification with
  nothing to emit, and this cache decides whether to run where Gradle's restores outputs. The archived
  goal's Outcome has the argument.
