# Test audit: the pack-naming PR

A per-test review of what `AS/pack-naming-convention` did to the test suite, in the shape
`docs/goals/goal-test-cleanup.md` uses. That goal audited `AS/package-boundaries` at `1dd69172e`;
this branch is not in its scope, so its tests were never classified. This closes that gap.

**Range:** `2f6b68ca264821eb392f400259fcfd2c70663f0f..HEAD` (the merge base with `AS/pack-type-facades`).
**Method:** test count per file at both ends, then read every test in a file whose count moved, plus
every deletion. Counting rather than reading the diff matters: this branch renamed identifiers inside
test *titles*, so `git diff` shows ~40 tests as added that already existed.

## Scope

| Change | Files | Tests |
|---|---|---|
| Added file | 1 | 2 |
| Deleted file | 3 | 5 |
| Renamed file | 3 | 0 net |
| Modified, test count moved | 8 | +15, -2 |
| Modified, identifiers only | 34 | 0 |
| **Total touched** | **46** | **+17, -7** |

**34 of 46 files are rename-only.** They are not a test-quality question and are not classified below.
The auditable surface is 17 added tests and 7 removed.

## Classification

Each test gets a verdict and, where it is not `KEEP`, the cause.

| Verdict | Meaning |
|---|---|
| `KEEP` | guards a regression path nothing else covers |
| `TRIM` | guards behaviour, also pins incidental detail |
| `MERGE` | overlaps another test; fold them |
| `MOVE` | right assertion, wrong level or package |
| `DELETE` | cannot fail meaningfully, or something cheaper fails first |

| Cause | Meaning |
|---|---|
| `old-spec` | describes behaviour that no longer exists |
| `scaffold` | written to steer development, not to catch a regression |
| `over-specified` | pins a message, a count or a format that is not the behaviour |
| `duplicate` | another test already asserts it |
| `tests-the-test` | asserts something about a fixture, helper or allowlist |
| `compiler-covers-it` | tsc rejects it at the call site |

## Added tests

### `abuddy-sdk/tests/build/provenance.spec.ts` (+4, `3bc532c2a`)

Declared names are user input: the manifest schema lets a pack call a command `constructor`, and
`entities`/`relKinds` are unrestricted strings. A provenance record indexed by them has to be a null
-prototype record.

| Test | Verdict |
|---|---|
| is not found on a record that never declared it | `KEEP` |
| is recorded like any other name when a pack does declare it | `KEEP` |
| keeps an entity named `__proto__`, which assignment would drop | `KEEP` |
| survives being written to a snapshot and read back | `KEEP` |

All four cover a bug found in review, each a distinct failure. The fourth is the one that matters:
`JSON.parse` *defines* `__proto__` as an own property where assignment does not, so the round trip is
where the loss actually happened. The `describe` block states why the names are reachable — a model for
what a guard's rationale should look like.

### `abuddy-sdk/tests/build/generate-entries.spec.ts` (+4, `3bc532c2a`)

The same family through a real `abuddy build` instead of the unit function.

| Test | Verdict |
|---|---|
| accepts a command named after something on `Object.prototype` | `KEEP` |
| still fails when a dependency really does declare that name | `KEEP` |
| falls back to the dependency for a surfaced name its provenance omits | `KEEP` |
| accepts an ancestor's entity named `__proto__` arriving through both sides | `KEEP` |

These overlap `provenance.spec.ts` by subject and not by level: the unit tests pin `_mergeProvenance`,
these pin what a four-pack diamond build produces. The second is the load-bearing one — it is what
stops the fix from being "make every collision pass".

### `api/tests/unit/boot-recovery.spec.ts` (+2, new file, `cac4f3460`)

| Test | Verdict |
|---|---|
| starts on a lock whose holder is gone | `KEEP` |
| restores an interrupted install's only copy, with no record | `KEEP` |

Deliberate duplication with the `@abuddy/host` unit tests, and the file says so: *"The unit tests for
these live in @abuddy/host. This one boots the real composition, because what both regressions broke was
the boot: one refused to start at all, the other deleted a pack on the way up."* That sentence is what
makes duplication defensible — it names the level and the reason. **Treat it as the template for any
integration test that repeats a unit test.**

### `abuddy-host/tests/packs/staging.spec.ts` (+2)

| Test | Verdict |
|---|---|
| restores every interrupted install when there is no record | `KEEP` |
| restores every interrupted install when the record cannot be parsed | `MERGE` |

The two differ only in how the record is unreadable (absent vs unparseable), and the code path is one
branch — `readInstalledPacksRecord()` returning `null`. One test with both inputs says the same thing.

### `abuddy-host/tests/packs/discovery.spec.ts` (+2)

| Test | Verdict | Cause |
|---|---|---|
| rebuilds the record with every pack enabled, and says so once | `TRIM` | `over-specified` |
| keeps a disabled pack disabled once the record exists | `KEEP` | |

The first has **four separate dependencies on log wording** in one test: it filters on
`'No record of installed packs'`, asserts `toContain('A pack disabled before this is enabled again.')`,
asserts the absence of `'New external pack discovered'`, and monkey-patches all four console methods to
catch them. None of those rewordings would be a regression.

What is worth guarding is that every pack comes back `enabled: true`, and that it is reported once
rather than per pack. The first is already asserted behaviourally. Keep the count and the pack names —
the actionable part — and drop the sentence pins.

This is the clearest instance in the PR of the pathology the goal exists for, and it is one I wrote.

### `abuddy-sdk/tests/env/app-context.spec.ts` (+1), `abuddy-host/tests/database/running-app.spec.ts` (+1 net), `abuddy-host/tests/database/write-lock.spec.ts` (+1 net)

| Test | Verdict |
|---|---|
| reads nothing from a file written before this boot | `KEEP` |
| ignores a port file that predates this boot | `KEEP` |
| refuses a lock it cannot read / takes over a lock whose process has exited (split from one) | `KEEP` |

The split is an improvement on what was there: the original test's title claimed it *took over* a lock
it could not read, and its body asserted the opposite. A passing test that says the wrong thing in the
runner output is worse than no test.

Note what already self-corrected here. An earlier version of this work applied the boot-epoch bound
uniformly, including to the write lock, and added an instance-lock test to match. `eac4e3c45` then
split the predicate by caller — bounded where a false free is harmless, pid-only where it costs data —
and removed the instance-lock test with it. **No orphaned test survived that reversal**, which is the
outcome the "old-spec" category is meant to prevent.

## Removed tests

| File | Tests | Verdict | Cause |
|---|---|---|---|
| `abuddy-host/tests/removed-names-in-docs.spec.ts` | 2 | `DELETE` ✓ | `scaffold` |
| `abuddy-sdk/tests/runtime/no-host-modules.spec.ts` | 1 | `DELETE` ✓ | `scaffold` |
| `abuddy-host/tests/boundaries.spec.ts` (2 of 7) | 2 | `DELETE` ✓ | `duplicate` |
| `abuddy-host/tests/packs/runtime/seed.spec.ts` | 2 | `DELETE` ✓ | `old-spec` |

All four were correct. The last is worth naming: `seed.spec.ts` asserted that a pack whose seed manifest
predates `seedKeys` is told to rebuild. The goal's Open decision 2 removed that guard, so the spec went
with the behaviour rather than outliving it — deleted in the same commit, `bc14492c2`.

`boundaries.spec.ts`'s two were redundant rather than dead: `api/tests/unit/source-layout.spec.ts`
compares every file under `packages/api/src` against an allowlist, so it already fails on a recreated
`api/src/packs`, with a better message and no way to go stale.

## What this changes about the goal

1. **`AS/pack-naming-convention` needs no phase of its own.** 15 of 17 added tests are `KEEP`. The two
   exceptions are one `MERGE` and one `TRIM`, both in `@abuddy/host`, both mine, and both small enough
   to fold into Phase 2.
2. **The added tests are mostly the good kind**, and the reason is visible: each came from a bug found
   in review — a prototype-chain fault, a boot that refused to start, a pack deleted on the way up.
   Tests written to close a specific failure classify as `KEEP`; tests written to steer a refactor
   (`removed-names-in-docs`) classify as `scaffold`. **Provenance predicts verdict better than age or
   size does**, and the audit is cheaper when it starts from "what was this written for".
3. **Counting beats diffing.** `git diff` reported ~40 added tests here; 17 were real. Any later audit
   of a rename-heavy branch should compare test counts per file first, or it will re-read work that
   only changed spelling.
4. **A duplicate with a stated level is not a duplicate.** `boot-recovery.spec.ts` repeats two unit
   tests on purpose and says which level it adds. Phase 3's duplicate hunt should spare tests that name
   their level, and require that sentence of the ones it keeps.
5. **Message pinning is the live pathology here, not dead guards.** The dead guards in this branch were
   already removed. What remains is `over-specified`: four log-string dependencies in a single test.
   Decision 2 covers it; the audit shows it is the category with the most left in it.
