# Test inventory: every test in the repo, with provenance and a verdict class

A complete pass over the test suite — what each test is, which commit introduced it, and which of five
verdicts it belongs in. Written to feed `docs/goals/goal-test-cleanup.md`, whose phases delete and trim
tests but whose audit covered one branch (`AS/package-boundaries` at `1dd69172e`). This covers all of it.

## Scale

| | |
|---|---|
| Spec files | 279 |
| Tests | 2,211 |
| Lines of test code | 36,048 |
| Distinct commits that introduced a test | 325 |

| Package | Tests | Flagged | Density |
|---|---|---|---|
| default-setup | 625 | 65 | 10% |
| abuddy-cli | 502 | 123 | **24%** |
| abuddy-sdk | 429 | 80 | 18% |
| abuddy-host | 401 | 70 | 17% |
| abuddy-ears | 102 | 16 | 15% |
| api | 73 | 17 | 23% |
| root E2E | 46 | 4 | 8% |
| renderer | 33 | 16 | **48%** |
| **Total** | **2,211** | **391** | **18%** |

## Method

`git blame -p` over every spec file, mapping each `it(`/`test(` line to the commit that introduced it,
its author date and its subject — 36k lines blamed, so provenance is per test, not per file. Signals are
then matched against each test's body (from its `it(` to the next one).

Two things this does **not** do, and a reader should not assume otherwise:

- **A signal is a candidate, not a verdict.** 391 tests carry at least one; each still needs reading.
  The remaining 1,820 are "no signal matched", which is not the same as "good test" — nothing mechanical
  detects a test of an old spec, a duplicate in substance, or an assertion that cannot fail.
- **The heuristics have known blind spots.** An early version flagged 30 files as importing no product
  code; the regex only matched `from '…'` and missed `await import()`, `vi.mock()` and `require()`.
  Corrected, it is 12 files. Anything derived from a signal in this report was re-checked by hand.

## Classification

| Verdict | Meaning |
|---|---|
| `KEEP` | guards a regression path nothing else covers |
| `TRIM` | guards behaviour, also pins incidental detail |
| `MERGE` | overlaps another test; fold them |
| `MOVE` | right assertion, wrong level or package |
| `DELETE` | cannot fail meaningfully, or something cheaper fails first |

| Signal | Tests | What it catches |
|---|---|---|
| `msg-pinned` | 174 | an assertion on a string literal of 45+ chars — a whole message, not the part a user acts on |
| `count-pinned` | 155 | `toHaveBeenCalledTimes(n)` or `toHaveLength(n)` — a count that is not the behaviour |
| `no-product-import` | 38 | the spec references no product module at all |
| `tests-fixture` | 20 | asserts something about an allowlist, fixture or the spec's own scanner |
| `dupe-title` | 17 | the same test title in more than one file |
| `type-only` | 5 | `typeof x === 'function'` — the type system's job |
| *(no signal)* | 1,820 | needs reading |

## Finding 1 — provenance does not predict the verdict

The pack-naming audit suggested that a test born in a `fix(` commit is usually a keeper and one born in
a `refactor(` is usually scaffolding. It looked right on 17 tests. Across 2,211 it is **flat**:

| Commit type | Tests | Flagged |
|---|---|---|
| `feat(` | 636 | 16% |
| `refactor(`/`chore(` | 518 | 14% |
| other | 480 | 18% |
| `fix(` | 381 | **16%** |
| `test(` | 113 | 11% |
| `docs(` | 83 | 24% |

A `fix`-born test is no likelier to be clean than a `refactor`-born one. The inference held on a sample
where every added test came from a review finding, which is a property of that branch, not of the repo.
**`goal-test-cleanup.md`'s Decision 11 should be struck** — it would have an implementer skim
`refactor`-born tests and trust `fix`-born ones, and the data supports neither.

Provenance is still worth having. It answers "what was this for" when a test's intent is unclear, which
is a reading aid. It is not a filter.

## Finding 2 — the dominant pathology is pinning, not dead guards

327 of 391 flagged tests carry `msg-pinned` or `count-pinned` (329 signal instances; 2 tests carry
both): **15% of the whole suite asserts a message or a count that is not the behaviour under test.** Dead guards, the category that prompted this work,
are a much smaller set and are largely already removed.

This matters for sequencing. The goal's Decision 2 (trim, don't delete, a test that pins detail) governs
far more of the suite than its delete decisions do, and `TRIM` will be the most common verdict.

Worst files by flagged count:

| Flagged / total | File | Mostly |
|---|---|---|
| 29 / 62 | `abuddy-cli/tests/cli/db.spec.ts` | `msg-pinned` (27) |
| 22 / 92 | `abuddy-sdk/tests/build/generate-entries.spec.ts` | `msg-pinned` (22) |
| 15 / 73 | `abuddy-cli/tests/build/import-specifiers.spec.ts` | `tests-fixture` (12) |
| 15 / 49 | `abuddy-sdk/tests/build/flow-compiler.spec.ts` | `count-pinned` (15) |
| 14 / 35 | `abuddy-sdk/tests/build/flow-round-trip.spec.ts` | `count-pinned` (14) |
| 12 / 43 | `abuddy-host/tests/packs/runtime/loader.spec.ts` | `count-pinned` (11) |
| 10 / 30 | `default-setup/.../canvas/__tests__/layout-utils.test.ts` | `count-pinned` (10) |
| 9 / 20 | `default-setup/tests/unit/claude-code-query.spec.ts` | `count-pinned` (8) |
| 7 / 9 | `abuddy-cli/tests/cli/scaffold.spec.ts` | `msg-pinned` (7) |

`db.spec.ts` alone is 27 message pins. A CLI's output is closer to a contract than most strings, so some
of those are real — which is the point of reading rather than bulk-editing.

## Finding 3 — 38 tests reference no product module

12 files. Five are the tree-scanning guards the goal keeps (`identity-guard`, `no-module-state`,
`source-layout`, `no-pack-seed-specifics`, `registry-state`) — they scan sources by design and import
nothing, which is correct. The rest are worth a verdict:

| Tests | File | Note |
|---|---|---|
| 10 | `api/tests/unit/claude-code-permission-shape.spec.ts` | tests a **standalone Zod mirror** of the Claude Code CLI's response, declared in the test. It cannot fail when our code changes, only when the mirror does. |
| 7 | `abuddy-host/tests/packs/pack-protocol.spec.ts` | a MIME map declared in the test and a re-implementation of the install logic — already Deferred in the goal (Decision 7) |
| 5 | `abuddy-cli/tests/cli/source-hooks.spec.ts` | drives the bin through a subprocess; the indirection is deliberate |
| 3 | `abuddy-cli/tests/cli/handoff.spec.ts` | same |
| 2+1+1 | `ui-import-side-effects`, `verify-node-modules`, `app-launcher` | check built artefacts, not modules |

`claude-code-permission-shape` is the clearest `DELETE`/`MOVE` candidate in the repo: ten tests whose
subject is a copy of someone else's schema. If the mirror is worth keeping, the test that matters is one
that compares it against a real CLI response, not ten that check the copy against itself.

## Finding 4 — structural clones

17 tests share a title with a test in another file. The clearest pair:

```
default-setup/tests/unit/_hybrid/actions-export.spec.ts   7 tests
default-setup/tests/unit/_hybrid/prompts-export.spec.ts   7 tests
```

Same seven titles, same shape, differing only in entity type: *exports all seeded X · strips internal
fields · preserves portable fields · returns correct metadata · creates directory if it does not exist ·
exports empty array when no X exist · re-imported X match original portable fields*. That is one
parameterised suite, `MERGE`, −7 tests.

Others are genuine near-duplicates across package boundaries, left when code moved:

- "names the fix when a provider has no key or none selected" — `abuddy-host/tests/secrets/store.spec.ts`
  and `abuddy-sdk/tests/services/secrets-rules.spec.ts`
- "rejects a command another pack declares, registering none of them" —
  `abuddy-host/tests/packs/backend-extensions.spec.ts` and `…/registration.spec.ts`
- "follows packs registering and unregistering with no manual invalidation" —
  `event-validation-map.spec.ts` and `partition-policy.spec.ts`

Each needs Decision 10's test: does the second one name the level it adds? If not, `MERGE`.

## Finding 5 — where the density is

`renderer` is 48% flagged on 33 tests, and `abuddy-cli` is 24% on 502 — the largest absolute pool of
candidates in the repo, and the package the goal's Phase 1 already opens with. `default-setup` holds the
most tests (625) and the lowest density (10%), so its two phases will be more reading for less return
than their size suggests.

## What this changes in the goal

1. **Strike Decision 11.** Provenance does not predict the verdict; the data is flat across commit types.
   Keep `git blame` as a way to answer "what was this for", not as a filter.
2. **Re-weight toward `TRIM`.** 327 pinning candidates against a much smaller set of dead guards. Decision 2
   is the load-bearing decision, not Decision 1.
3. **Add the three files this found that the branch audit could not see**: `claude-code-permission-shape.spec.ts`
   (10, tests a mirror), the `_hybrid` export clones (14 → 7), and `import-specifiers.spec.ts`'s 12
   `tests-fixture` hits.
4. **Phases stay per-package**, and the density table says which will pay: cli and sdk first by return,
   default-setup last despite being largest.
