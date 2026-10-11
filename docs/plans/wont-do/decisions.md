# Decisions not to act

Things considered and deliberately not done, each with the condition that would change the answer. The folder
says `wont-do`; the middle section is the softer kind — not refused, just not now — and it lives here because
what both need recording is the same thing: the reasoning, and what would revive it.

Audited 2026-09-28. Two entries' premises have moved since they were written and say so in place.

**Not goal docs, on purpose.** `docs/goals/README.md` says a goal doc is for work that "spans several sessions or
phases" and that "a single fix … stays in the conversation." Every entry here is smaller than that bar, and most
are a refusal rather than a plan. What they have in common is that the reasoning cost something to establish and
would otherwise be re-derived — usually by proposing the same mechanism again.

Where an entry's fuller reasoning already lives somewhere durable, it is linked rather than repeated. An entry
with no link is recorded only here.

## Won't do, unless the condition fires

| | why not | condition |
|---|---|---|
| **A ban on raw directory reads in specs, with a guard** | 41 files to close a hazard that measured at zero, and it guards the walk where the vacuity is in the filter ([archived plan](../../archive/plans/vacuous-assertions.md)). **Its condition fired on 2026-09-28 and the entry still stands** — twice, and neither was a raw directory read: `chain-inputs`' lint case reported green while the `-ws` fan-out left 858 files unexamined (`75fe1a895`), and `unused-code-gate` read 15 of 25 tsconfigs (`b35cb14ac`). Both were a *derivation* that stopped early, which a ban on `readdirSync` would not have caught. So the condition is worded for the symptom and the ban addresses a different cause; what the two cases argue for is deriving a population from the thing that defines it, which is a habit rather than a gate | a check is found green over a population it never read **and a guard on the walk would have caught it** |
| **Requiring an `:update` for every `:check`** | the gate added in `73366d8b8` runs one way, `:update` implies `:check`, because that is the direction the convention's reason points: an artifact nothing re-derives goes stale in silence. The reverse has no offenders and three legitimate exceptions whose pair is under a different convention — `lint:check`/`lint:fix`, `packages:check`/`packages:build` — so it would buy an exceptions list and nothing else | a `:check` is found recording a file with no `:update` to re-record it |
| **Consolidating the temp-dir pattern across 133 specs** | three shapes with a long tail — 45 of them put the `rmSync` in a teardown that does other work — and nothing leaks today | a leaked temp dir causes a flake |
| **Testing the public docs** | `add50f772` removed a docs test the day it was added: "docs are not tested in this repo". **That sentence is no longer true** — `doc-links.spec.ts` checks every relative link between the repo's documents, and `lint-scope.spec.ts` and `pack-rules.spec.ts` both hold a docs table to what the code declares. What none of them does is test the docs' *content*, which is what this entry is about | a code fence someone copied is found broken, or a doc's prose is asserted somewhere and drifts |
| **A check that every reader of a step's `outputs` declares `needs` on it** | it holds for all five output-writing steps, and a gate over a population with no offenders is not worth its own maintenance. The one place that depended on the invariant no longer does ([`scripts/chain.ts`](../../../scripts/chain.ts), the sweep above the retry) | a step reads another's outputs without a `needs` edge |

## Not yet

| | state | condition |
|---|---|---|
| **The flow DSL's `llm` helper has no *authored* call site** | it is exercised by `_support/every-step-flow.ts`, which the fidelity spec round-trips and the export example records — so its shape is covered, and the audit that said "no spec" grepped `src/content` and `docs/` but not `tests/`. What is still unexercised is an author reaching for it: no content flow uses it. Marked provisional where an author's editor shows it ([`llm/types.ts`](../../../packages/default-setup/src/extensions/steps/llm/types.ts)) | someone authors a content flow with it, and finds the rough edges |
| **A field mapping's `default` can be read but not written** | `node-attribute-mappers.ts:79` and `:89` apply `mapping.default` at runtime, so it is not vestigial — but every form that builds a mapping pushes `default: undefined` (`llm/form.vue:326`, `fire/form.vue:124`, `action/form.vue:302`) and the DSL has no syntax for one, so nothing can set it. Expressing it is a feature rather than a fix | someone wants a default for a mapped field |
| **`checkout-freshness.d.ts` ships with an import nothing can resolve** | `@apack/testing`'s tarball carries it, and it names `StaleUnit` from the private `@apack/host` in an options bag only this package's own spec ever passes — both published entries call the function with no arguments. Harmless today because no entry's declaration references it, so a consumer cannot name the type; it is shipped weight rather than published surface, which is why `bundle-package.ts`'s check is scoped to what the exports map reaches | a consumer type-checks `node_modules` wholesale, or the module becomes reachable from an entry |
| **Node positions are not persisted** | no entity holds them, so the flow editor re-runs ELK on every load and a user's arrangement is discarded. A missing feature rather than a defect — every user meets it | it is worth a field on the node and a migration |
| **The retry's own output is discarded** | `classifyLine` reports the verdict, not the second run's output. If the retry fails differently, that difference is lost; printing two step outputs for one failure is its own noise | a retry is seen to fail for a different reason than the original |

## Closed, kept for the reasoning

| | |
|---|---|
| **An `@app/*` test-support package** | its condition fired — `export-example.spec.ts` in `default-setup` needed `population` and could not import `@apack/host` — and the answer was not a new workspace. `population` and `packFixture` are pure (`node:fs`/`os`/`path` and nothing else), so they moved to `@apack/sdk/testing`, which every pack already depends on and which resolves source under `@apack/source` exactly as the host path did. The objection recorded against that destination was about `@apack/testing` resolving `dist`, and about a layer rule that governs what `@apack/sdk` may *import* rather than what it may hold |
| **A record of chain outcomes, to contradict a `0 failures` column in a schedule measurement** | a log of failures is mostly legitimate ones, so the signal drowns. Replaced by retry-and-classify, which discriminates by action rather than by volume — the chain re-runs a failed step alone and says whether it reproduced |
