# Codegen staleness

`src/__generated__/` is written by `abuddy generate-entries` (`@abuddy/cli`'s `commands/generate-entries.ts`,
over `generatePackFiles` in `@abuddy/sdk/build`) from inputs that reach it through no module graph: nothing
anyone imports connects `abuddy.json` to the barrels generated from it, so the files can describe a pack that
is no longer there.

**Nothing here is open work.** This records what keeps them current, what that mechanism cannot see, and the
one thing that was planned for it and will not be built. The rule-level description lives with the command
(`packages/abuddy-cli/CLAUDE.md`, the `generate-entries` row); the annotated list of what each generated file
holds is `packages/default-setup/CLAUDE.md`.

## What generation reads

| Input | Moves when |
|---|---|
| the manifest (`abuddy.json`) | a feature, plugin path, entity, extension, repository or seed format changes |
| the generator | codegen's own output pattern changes (`codegenSource()` is what hashes it) |
| the pack's `src/` | a service export's shape, a step's `build.ts`/`types.ts`, which `*-fe.ts` files exist |
| a resolved dependency's snapshot | generated flow helpers and `deps/<id>.d.ts` follow every dependency |

## What regenerates

Every caller of `generateEntries`, which is the whole set:

- **`prepare`** — so `npm install` in the pack regenerates.
- **`abuddy generate-entries`** by hand, as `npm run generate:entries`; `--force` ignores the stamp below.
- **`abuddy build`**, unless `--skip-generate`. This is the one every repo command arrives through:
  `npm start` (`prebuild:be:dev` → `build:dev` → `abuddy build --skip-fe`), `npm run build:be`
  (`prebuild:be`, which also runs `generate:entries` outright), `npm run build` (`-ws`, through the pack's own
  `build`) and `npm run compile`.
- **`abuddy facade-report`** — it bundles the facade from `src/__generated__/pack-types.ts`, so a report held
  against a stale barrel would be held against nothing; it regenerates before it bundles.
- **`abuddy init`**, and **`abuddy run`** on each rebuild (`--force`).
- **`scripts/repro.ts`** (`--force`), because a second build that skipped codegen would re-hash output it never
  regenerated — `npm run check:repro` compares two builds of one input and that is what makes them two.

A **branch switch or a Vite restart is not one of them**: `src/__generated__/` is gitignored, so it survives
`git checkout`, and what fixes it is the next command above. Mid-session that is a restart; the stamp is what
makes paying for it nearly free.

## Freshness is a recorded stamp, not a timestamp

`.inputs-hash` holds `{ hash, files }` — a SHA-256 over the inputs above, and the list of files that run
wrote. `staleReason` asks three questions in that order: is there a record, is every file it recorded still
there, does the hash still match. The missing-output check is first on purpose, and the source comment has the
measurement: recording only the hash let `rm src/__generated__/paths.ts` leave the pack unbuildable while the
command printed *"inputs unchanged, skipping"*. The list is recorded rather than fixed because the output set
follows the manifest — a pack with no plugins never writes `fe.ts`, and a hard-coded expectation would call it
stale for ever. It is the shape `unitStaleReason` (`@abuddy/host/build/packages-built`) uses for the package
builds, asked in the same order.

Measured on default-setup, median of 3 on an 86%-idle machine, 2026-10-07: **0.72s when it skips, 1.54s when
it regenerates.** The ~0.8s between them is the work; the rest of either figure is npm and Node starting, which
is why a command that regenerates once per start is not worth avoiding.

**One writer per pack.** `.generating.lock` (`holdExclusiveLock`) refuses a second concurrent run by name,
because two runs interleaving their writes lose silently: every file is written, the last writer wins each one,
and the result reads as a build nobody can reproduce. It happened here — concurrent runs left the type barrel
describing a fix that was already compiled.

**What the stamp cannot see is bounded by hashing a superset.** A key over a *list* of what someone believed
the reads were can go stale from a read nobody listed; this hashes all of `src/` instead, minus
`__generated__`. So an unlisted read is not a failure mode, and what it costs instead is regenerating when an
unrelated source file moves — the cheaper direction, at 0.8s of work.

## Loading is virtual; generation is not

Two layers, and only the first of them is a virtual module:

```
Loading       virtual:built-in-pack-loaders  (api, tsup plugin)      → import('pack-entry.ts')
              virtual:built-in-packs         (renderer, vite plugin) → import('pack-entry-fe.ts')
Generation    the on-disk barrels those two import from
```

Both plugins scan `packages/` for `abuddy.json` at build time and generate a map of `import()` expressions;
`packages/api/src/runtime/index.ts` and `packages/renderer/src/main.ts` are what consume them.

**That top layer is what [`one-kind-of-pack.md`](one-kind-of-pack.md) takes apart, and the generation layer
below it is untouched by that plan** — worth knowing before doing either, because the two live in the same two
config files. Its step 3 deletes `virtual:built-in-pack-loaders` outright (production requires
`dist/runtime/index.cjs` from the pack's own directory, as development already does) and re-keys
`virtual:built-in-packs` into a dev-only `virtual:dev-pack-frontends`, with production frontends arriving over
`pack://`. What it does not change is any of this document: the barrels stay on disk, written by the same
command on the same triggers, under the same stamp. Its step 1 only adds a context — default-setup's build
stops returning early, so it records the `runtime` and `fe` phases like any pack — and it reaches codegen
through `abuddy build`, which already regenerates.

**It makes the refusal below stronger rather than weaker.** After step 3 no production bundler is positioned to
synthesise a barrel at all: the renderer's plugin is dev-only and each pack's own `abuddy build` produces its
bundles, so the number of tools that need a file on disk goes up.

## Virtualising the barrels: won't do

The plan this document opened with proposed making the simple re-export barrels virtual modules, produced from
the manifest by a Vite/esbuild plugin, so they could not be stale at all. **That cannot work here, and the
blocker is not cost.**

A virtual module has no file, so every tool that reads pack code has to be taught to resolve it — and the
pack's own typecheck is one of those tools. `vue-tsc --noEmit` compiles `src/**` (the pack's
`tsconfig.json` `include`), reaching the barrels through a `#generated/*` mapping that is declared **twice** by
necessity, in `package.json` `imports` for the runtimes and `tsconfig.json` `paths` for the compiler. `tsc`
has no plugin to ask, so a virtual barrel is `TS2307` to it, and the declarations would have to be written to
disk anyway — which is the file the plan wanted to remove. The same reasoning retired the `@/` path aliases
([`goal-one-way-to-name-your-own-modules.md`](../archive/goals/goal-one-way-to-name-your-own-modules.md)):
four bundler configs each re-implementing a mapping no runtime reads. `one-kind-of-pack.md` reaches the same
fact from the other side — the `@<pack-id>/` alias half of `builtInPacksPlugin` has no remaining user, because
nothing imports `@default-setup/…` once a pack names its own modules with `#` subpaths.

What the plan was reaching for is already had by other means: the stamp makes regeneration cheap enough to run
on every build, the missing-output check makes a deleted barrel loud instead of silent, and the lock makes two
runs an error rather than a corruption.

**The condition that would revive it:** a generated module that no pack source imports and no `tsc` program
includes. There is none today, because a pack's tsconfig includes its `src/` whole.

## Related: the FE barrel

The investigation that produced this document also found the first instance of a separate rule, which now
lives in the root `CLAUDE.md`: **frontend-reachable SDK code imports `@abuddy/sdk/utils/pure` or a specific
file, never the `@abuddy/sdk/utils` barrel**, which is Node-only by construction (`paths`, `media`, `export`,
`seed`). The instance was `randomId`, pulling `process.env` into the browser bundle through the barrel; it is
`utils/random-id.ts` now, re-exported from `pure.ts`.
