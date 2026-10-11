# __NAME__

An [apack](https://github.com/spankyed/apack) pack.

## Commands

| | |
|---|---|
| `npm run build` | Compile the pack to `dist/` |
| `npm test` | Unit tests, against the pack's own runtime in memory |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run validate` | Check the manifest and what the pack's code may say, without building |
| `npm run dev` | Build, install into the development app, and reload it on a change |
| `npm run facade:check` | Fail if `etc/pack-types.api.md` is stale. Needs no build: it bundles the facade itself |
| `npm run facade:update` | Rewrite it, and commit the result |

`apack add feature <name>` scaffolds a feature; `apack add --help` lists the rest (steps, artifacts,
blocks, actions, prompts, flows, services, migrations).

## The facade report

`etc/pack-types.api.md` is the reviewed record of your pack's facade — the types packs depending on this one
compile against, the bundle `npm run build` writes to `dist/types/pack-types.d.ts`. It is normalised so it
changes only when the facade does, which is what makes a change to what dependents can see show up in a diff
rather than at their next build.

Both scripts bundle the facade themselves, so neither needs a build to have run; `npm run build` warns when
the committed report has fallen behind what it produced.

It does not exist until the first `npm run facade:update`. Commit it once it does.

## Testing against the app

`apack init-tests` adds a Playwright suite that launches apack with this pack installed, and
`apack test` runs it. `apack test --contract` runs the unit tests alone, with no app.

## Releasing

Push a tag matching `apack.json`'s version (`v1.2.3`). `.github/workflows/release.yml` validates,
typechecks, tests, builds, packs and publishes it to a GitHub release.
