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
[`docs/archive/plans/one-pack-fixture.md`](../../docs/archive/plans/one-pack-fixture.md) was written to avoid.

**Not a build, and not an install.** `buildPack(dir)` builds one and the installer places one; both already
take a directory, so this composes with them rather than growing a `built` or `installed` option. The
*installed* shape — a manifest beside `integrity.json`, a snapshot and `dist/runtime` — is a different artifact
whose layout `@abuddy/host` owns (`PACK_LAYOUT`), and host's tests build it in host, where the layer rule keeps
it: a layer may not import test tooling, which is the same reason `population` stayed in the SDK.

**Who can use it is a layer question, measured.** Of the 98 sites that write a pack manifest in a test, 54 are
in the two packages that may import an `@app/*` package (`@abuddy/cli`, `@app/repo-checks`). The other 44 are
in `@abuddy/host`, `@abuddy/sdk`, `packages/api` and `@app/default-setup`, which may not — so a hand-written
manifest there is the only option available, and the guardrail that forbids one derives its scope from `LAYERS`
rather than claiming the repo.

## Converting a spec that writes its own pack

Three things come up every time, in this order:

1. **Drop the caller's `mkdirSync(dir, 'src')`.** The fixture owns the tree and `files` creates any depth, so
   a non-recursive mkdir afterwards throws `EEXIST`. It bit three of the five conversions.
2. **A spread becomes the merge.** `JSON.stringify({ id, name, version, ...manifest })` is exactly
   `manifest: { id, name, ...manifest }` — two specs were already doing by hand what the option does.
3. **Check it still fails.** Break what the spec asserts and watch the converted version fail; a fixture that
   grows files can quietly stop a case from firing. `host-import-guard` was checked that way: with its
   offending import removed, two of its five cases fail.

**What not to convert**, from the sites left alone deliberately:

- a `'{}'` **discovery marker** — three in `import-specifiers.integration`, where a directory holding *any*
  `abuddy.json` is the subject and eight files of content would slow the walk it tests for nothing;
- a **patch** of a pack something else scaffolded (`abuddy init`, then a manifest edited) — the pack exists
  and the spec is changing it, which is a read-modify-write and not a fixture;
- a **manifest that is the subject** written with no tree around it (`pack-generate`, `pack-cli`'s
  `writeManifest`), where a pack directory would change what the command under test sees;
- the **installed/published shape** (`packs/host-output`), which is `@abuddy/host`'s artifact.

## Tests

`npm test -w @app/pack-fixtures` — one spec. What it asserts is the thing a fixture library can get wrong:
that every path the manifest declares is a file that exists, read from the tree rather than from the literal
that wrote it; and that the two manifest options keep their separate meanings, since a merge cannot express a
key that is absent. No `pretest`: this package reads no build output.
