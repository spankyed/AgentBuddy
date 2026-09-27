# @app/publish-checks

What a consumer gets when they install the published `@abuddy` packages — and the fixture that finds out.

Nothing here ships. It is a workspace for one reason: the fixture it owns is needed by two packages, and a
workspace is how two packages share a module by name.

## Why it exists

These specs lived in `@abuddy/cli`, and none of them is about the CLI. They npm-pack `@abuddy/ears`, the
SDK and UI into a temporary consumer and compile it across the TypeScript matrix, which is a property of
the *publish*, owned by no single package: `published-exports` and `published-declarations` install all
three at once, so there is no one package they could move to.

The fixture decided the shape. Three `@abuddy/cli` specs — `facade-typing`, `fe-bundler-host-registry`,
`types-bundler-determinism` — use a packed consumer to test the CLI's own bundlers, and they stay there.
So `installPublishedPackages` has to be reachable from two packages without a relative path across one,
and the alternatives all cost more: putting it in `@abuddy/testing` ships repo-internal packing tooling to
pack authors, and distributing the specs gives `@abuddy/sdk` and `@abuddy/ui` an expensive
pack-and-compile half each where both suites are pure and fast.

**Not everything named `published-*` belongs here.** `published-imports` is in `@app/repo-checks`, because its
subject is `scripts/lib/published-imports.ts` — a module five build scripts use, so it cannot leave `scripts/`.
`published-sdk-peers` came the other way, from there to here, once its subject was read as the published SDK
rather than the script it borrows from. The family is split by subject, not by accident.

## What is here

| Spec | Subject |
|---|---|
| `published-exports`, `published-declarations` | what a consumer can import, and that the declarations resolve, across all three packages at once |
| `published-sdk-any`, `published-sdk-types` | the SDK's published surface: no `any`, and it compiles for a consumer |
| `published-ui-types` | `@abuddy/ui`'s declarations compile for a consumer |
| `published-specifiers`, `published-ui-dist` | what the built `dist` trees contain: declared bare imports, no SFC source shipped, no relative CSS `@import` left |
| `published-manifest-paths` | that each of the **five** published trees names only files its tarball holds, publishes no `scripts` and ships no `src/`. The only spec here that covers `@abuddy/cli` and `@abuddy/testing` too, because their manifests are generated and their shape is not the other three's |

`src/published-packages.ts` is the fixture: `installPublishedPackages()` (npm-packs the three into a temp
`node_modules`), `packedFiles()` (one `npm pack --dry-run`, for a check that needs the file list and not a
consumer), `compileConsumer()` over `CONSUMER_MATRIX` (the workspace TypeScript and the 5.7 floor
from `packages/typescript-floor`, × `node16`/`bundler`), `PACKED_PACKAGES`, and `PACKAGES_BUILT`.
`@abuddy/cli` imports it as `@app/publish-checks`.

What it packs is each package's **staged** tree (`publishedTreeDirs()`), never the workspace directory: no
published package carries its workspace manifest, because that manifest resolves `src/` under the
`@abuddy/source` condition and no tarball ships `src/`. `@abuddy/host/build/published-manifest` derives what
is published; a consumer fixture reads the derived manifest, as a consumer does.

## Tests

Two halves, split by measured cost like every other suite (`scripts/lib/spec-cost.ts`, `etc/spec-cost.json`):

- **`npm test -w @app/publish-checks`** — 4 specs: three read the built `dist` without packing anything, and
  `published-manifest-paths` packs five file lists with `--dry-run`, ~1.5s, which keeps it in this half.
- **`npm run test:integration -w @app/publish-checks`** — 5 specs, about 28s. Each packs and compiles, so
  the config caps worker threads; the comment there has the reason.

Both halves have a `pretest` that builds the packages, because `npm run test:integration` fires no `pretest`
hook of its own — npm only runs `pre<script>` for the script named. Without it the standalone command tests
whichever `dist` happens to be on disk.
