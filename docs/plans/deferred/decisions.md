# Deferred decisions

Things considered and deliberately not done, each with the condition that would change the answer.

**Not goal docs, on purpose.** `docs/goals/README.md` says a goal doc is for work that "spans several sessions or
phases" and that "a single fix … stays in the conversation." Every entry here is smaller than that bar, and most
are a refusal rather than a plan. What they have in common is that the reasoning cost something to establish and
would otherwise be re-derived — usually by proposing the same mechanism again.

Where an entry's fuller reasoning already lives somewhere durable, it is linked rather than repeated. An entry
with no link is recorded only here.

## Won't do, unless the condition fires

| | why not | condition |
|---|---|---|
| **A ban on raw directory reads in specs, with a guard** | 41 files to close a hazard that measured at zero, and it guards the walk where the vacuity is in the filter ([archived plan](../../archive/plans/vacuous-assertions.md)) | a check is found green over a population it never read |
| **An `@app/*` test-support package** | the two helpers it would hold are reachable from every spec that needs them today; a workspace, its vitest project, its chain inputs and eleven devDependency lines buy nothing | a spec in `@abuddy/sdk`, `/ears`, `/ui` or `default-setup` needs `packFixture`, none of which can import `@abuddy/host` |
| **Consolidating the temp-dir pattern across 133 specs** | three shapes with a long tail — 45 of them put the `rmSync` in a teardown that does other work — and nothing leaks today | a leaked temp dir causes a flake |
| **Testing the public docs** | `add50f772` removed a docs test the day it was added: "docs are not tested in this repo" | that position is reopened |
| **A check that every reader of a step's `outputs` declares `needs` on it** | it holds for all five output-writing steps, and a gate over a population with no offenders is not worth its own maintenance. The one place that depended on the invariant no longer does ([`scripts/chain.ts`](../../../scripts/chain.ts), the sweep above the retry) | a step reads another's outputs without a `needs` edge |

## Not yet

| | state | condition |
|---|---|---|
| **The flow DSL's `llm` helper has no call site** | no seed flow, no spec, no doc example, so its authoring surface has never been exercised. Marked provisional where an author's editor shows it ([`llm/types.ts`](../../../packages/default-setup/src/extensions/steps/llm/types.ts)) | someone authors a flow with it, and finds the rough edges |
| **`exported-flows.json` is stale** | the committed round-trip reference uses `steps:` where `Track` now has `exits`, and `"type": "flow"` where the step is `subflow`. Nothing tests it; its README calls it a debugging aid | it misleads someone, or the round-trip suite grows to cover it |
| **Node positions are not persisted** | no entity holds them, so the flow editor re-runs ELK on every load and a user's arrangement is discarded. A missing feature rather than a defect — every user meets it | it is worth a field on the node and a migration |
| **The retry's own output is discarded** | `classifyLine` reports the verdict, not the second run's output. If the retry fails differently, that difference is lost; printing two step outputs for one failure is its own noise | a retry is seen to fail for a different reason than the original |

## Closed, kept for the reasoning

| | |
|---|---|
| **A record of chain outcomes, to contradict `lanes 3 → 0 failures`** | a log of failures is mostly legitimate ones, so the signal drowns. Replaced by retry-and-classify, which discriminates by action rather than by volume — the chain re-runs a failed step alone and says whether it reproduced |
