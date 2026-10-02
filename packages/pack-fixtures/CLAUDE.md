# @app/pack-fixtures

A pack on disk, for the specs whose subject is **pack tooling** — the import rules, the pack rules, the
bundlers, the installer. One export, `packFixture`, which writes a complete pack directory and returns its
path.

Nothing here is published, imported by the app, or part of a pack. It is a workspace because two packages
consume it and neither may reach into the other's tree (`repo-checks/tests/spec-placement.spec.ts`).

## Why it is not in `@abuddy/sdk/testing`

It was, until 2026-10-02, and its own comment named the condition for moving: a second consumer. Two arrived
(`@app/repo-checks`, `@abuddy/cli`), and the cost of staying was concrete — a repo-internal fixture inside a
**published package's reviewed surface**, carried in `etc/testing.api.md`, gated by `api:check`, keyed by
`api:stamp` and shipped in the tarball, for something no pack author has a use for: it materialises a pack
directory to test the tooling that reads pack directories.

`population` stayed behind, and that asymmetry is deliberate: `@app/default-setup`'s tests use it, and a pack
may not import an `@app/*` package.

**Not `@abuddy/testing`**, whose three exports resolve `./dist/package/dist/*.js` with no source branch — on
purpose, so a pack's run sees what a pack author sees — which would put `packages:build` in front of every
fixture edit. **Not `@app/publish-checks`** or **`@app/repo-checks`**, whose subjects are what we publish and
what the repo's own tooling does; a fixture home in either makes it two packages in one, which is what
extracting `@app/repo-checks` from `@abuddy/cli` was done to undo.

## What "complete" means, and why it is the whole point

`packFixture` writes both subpath maps, a manifest declaring a feature's two halves, and the files those paths
name. The shapes it replaced were each missing something, and **a fixture too thin for a rule to fire is a
case that passes because it could not fail**: `import-specifiers.integration.spec.ts` measured that — half
its sweep ran on a fixture where `own-modules` and `contract-leaves` could not speak, so for those rows the
sweep asserted nothing.

Which module is a contract is what `abuddy.json` says, not what a file looks like, so a fixture without a
manifest is one several pack rules cannot speak about at all.

## What it is not

Not the in-memory harness. `setupPackTests` (`@abuddy/testing/harness`) takes a *registration object* and runs
a pack's code; this materialises a *directory*. Different axes, and conflating them is the mistake
[`docs/plans/one-pack-fixture.md`](../../docs/plans/one-pack-fixture.md) exists to avoid — that plan is also
where the rest of this package's intended shape lives: fidelity (`built`, `modules`) as options on this
builder, adopted by the 46 files that currently write a pack manifest as a string literal.

## Tests

`npm test -w @app/pack-fixtures` — one spec, asserting the thing a fixture library can get wrong: that every
path the manifest declares is a file that exists, read from the tree rather than from the literal that wrote
it. No `pretest`: this package reads no build output.
