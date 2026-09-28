# One `Given a pack …`, defined once

## Context

A spike measured whether Gherkin belongs in this repo and concluded its *format* costs more than it gives here (4×
the lines, a runtime typo where the compiler gave `TS2820`, a cell containing ` | ` that silently truncated and let
a run report "8 of 7 scenarios pass"). What Gherkin does *structurally* is three things, and this repo already has
two natively: Scenario Outline + Examples is `it.each` — **118 tables across 57 specs** — and
scenario-as-a-sentence is the house style.

The third it does not have: **a shared step vocabulary**. `Given a pack that …` is written privately in
**35 spec files across six packages** — `pack`, `makePack`, `writePack`, `packFixture`, `packWithImports`,
`packWithDefaults`, `packSource`, `packRepo`.

That gap has already cost twice:

- `packages/abuddy-cli/tests/build/pack-rules.spec.ts` carries **three** shapes: `pack()`, `packWithImports()`
  (a `package.json` and a `#generated/*` map, **no manifest**) and an inline `abuddy.json` written for the
  `contract-leaves` case because neither of the other two could express a contract leaf.
- `packages/repo-checks/tests/import-specifiers.integration.spec.ts` records the same lesson after paying for it:
  *"there used to be two and the difference was invisible … `own-modules` and `contract-leaves` **cannot fire there
  at all** — measured. Half the sweep's fixtures were that shape, so for those rows those two rules' 'and no other
  rule claims it' said nothing: they were not able to claim."*

A fixture that is quietly too weak to make a rule speak is the same failure as a scenario that passes while
asserting a truncated string — it is the repo's own *"a check that reports nothing may have looked at nothing"*,
one layer down.

**Outcome: one builder, complete by default, so that shape cannot be built by accident.**

## Where it lives, and why not the other two places

`packages/abuddy-host/src/testing/pack-fixture.ts`, exported as `@abuddy/host/testing/pack-fixture` — one line in
host's hand-written 25-entry `exports` map.

- **`@abuddy/host` is `private: true`** and resolved from source, so this costs no API report, no `publint`/`attw`,
  no staged publish tree — and `@abuddy/cli` and `@app/repo-checks`, the two packages that paid for the gap,
  already depend on it.
- **Not `@abuddy/sdk`**, which would reach all six packages but is *published*: a new entry means an exports-map
  line, an `etc/<entry>.api.md`, `api:update` on every change, and a public surface a pack author gains nothing
  from — they test a real pack, not a fixture of one. The SDK's own three pack specs mostly validate manifest
  *objects* rather than writing trees, and keep their local helpers.
- **Not `@abuddy/testing`**, which sits above host and resolves its built bundle: every edit to test machinery
  would need a rebuild before the specs saw it.
- `@abuddy/sdk/src/testing/` is the precedent for test machinery inside a package's `src`, and host's only layout
  rule constrains `src/services` (`packages/abuddy-host/tests/boundaries.spec.ts:149`).

## 1. The builder

```ts
packFixture({ at?: string; files?: Record<string, string>; manifest?: PackManifestish }): string   // → the dir
```

Complete by default, which is the whole point: a `package.json` with both subpath maps (`#generated/*`,
`#features/*`), an `abuddy.json` declaring one feature with **both** halves' entries and contracts, and the files
those paths name (`src/__generated__/events.ts`, both entries, both contracts). `files` merges over the base, so a
case wanting a malformed pack writes `files: { 'abuddy.json': '{}' }` and one wanting an offending module writes
that module. `at` defaults to a fresh `mkdtemp`; `import-specifiers.integration.spec.ts` passes a path, because
its rules' populations are `packages/*`-shaped and the pack has to sit there.

Four options, no more — the god-function risk is real, and the other ~30 call sites are not its subject. Lifetime
stays with the caller, as it is today.

## 2. The five variants that collapse

- `packages/abuddy-cli/tests/build/pack-rules.spec.ts` — `packWithImports` and the inline-manifest case added for
  `contract-leaves`. `pack()` stays only where a case is *about* a malformed or minimal pack.
- `packages/repo-checks/tests/import-specifiers.integration.spec.ts` — `packFixture` and the contract-leaf
  describe's local `pack(files)`, which already build this shape by hand.

**Verify by running, not by reasoning:** the shared fixture is *more* complete than two of the variants, so a case
asserting every rule's findings (`offender()` in `pack-rules.spec.ts`) could see a new one. The base files are
clean, so it should not — and "should not" is what the suites are for.

The other ~30 stay. They build installers, releases, bundler inputs and E2E trees; forcing those through one
builder is how a four-option helper becomes a twenty-option one.

## 3. The guard that keeps it

A case in `packages/repo-checks` over the population the weak shape silently disables: specs that assert pack-rule
findings (they import `packRuleProblems`, or the rule entry points from `scripts/check-import-specifiers.ts`).
Each must build its pack with `packFixture` rather than writing `abuddy.json` by hand, with an exception table
carrying a reason per entry — the repo's own idiom, measured at **10 of 10** conformance elsewhere — and a firing
case of its own, since a rule with no firing case is a gate nothing has watched fail.

Deliberately narrow: three files today, an exception list that starts empty. A repo-wide version would need ~30
exceptions on day one, and a list that long is one nobody reads.

## Verification

| | |
|---|---|
| the point of the change | delete the manifest from the builder's default: the `contract-leaves` cases must fail. Today two of the three shapes cannot make that rule speak at all |
| no behaviour moved | `npm test -w @abuddy/cli -- pack-rules` (43) and `npm run test:integration -w @app/repo-checks` (242) pass with their expectations unedited |
| the guard bites | point one of the three specs at a hand-written `abuddy.json`: it must be reported, naming the file |
| the rest of the tree | `npm run check:specifiers`, `npm run typecheck`, `npm run chain` |

## Risks

- **A more complete fixture can surface findings the old one could not.** That is the intent, and it is also how
  this breaks: run the two suites before believing the migration is mechanical.
- **Test machinery inside a runtime package.** `@abuddy/host/src` is bundled into the API; an unimported module is
  tree-shaken, and the SDK already does this with `src/testing/`. The alternative — a new workspace — trips
  `spec-placement`'s "every package with source has a suite" and costs chain inputs for one builder.
- **Another agent is committing on this branch.** Commit in chunks with explicit pathspecs, and re-run the
  mutation checks after any rebase rather than trusting a merge.
