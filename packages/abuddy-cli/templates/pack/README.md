# __NAME__

An [AgentBuddy](https://github.com/spankyed/AgentBuddy) pack.

## Commands

| | |
|---|---|
| `npm run build` | Compile the pack to `dist/` |
| `npm test` | Unit tests, against the pack's own runtime in memory |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run validate` | Check the manifest and what the pack's code may say, without building |
| `npm run dev` | Build, install into the development app, and reload it on a change |
| `npm run facade:check` | Fail if `etc/pack-types.api.md` is stale (run after a build) |
| `npm run facade:update` | Rewrite it, and commit the result |

`abuddy add feature <name>` scaffolds a feature; `abuddy add --help` lists the rest (steps, artifacts,
blocks, actions, prompts, flows, services, migrations).

## The facade report

`etc/pack-types.api.md` is the reviewed record of `dist/types/pack-types.d.ts` — the types packs depending on
this one compile against. It is normalised so it changes only when the facade does, which is what makes a
change to what dependents can see show up in a diff rather than at their next build.

It does not exist until the first `npm run build && npm run facade:update`. Commit it once it does.

## Testing against the app

`abuddy init-tests` adds a Playwright suite that launches AgentBuddy with this pack installed, and
`abuddy test` runs it. `abuddy test --contract` runs the unit tests alone, with no app.

## Releasing

Push a tag matching `abuddy.json`'s version (`v1.2.3`). `.github/workflows/release.yml` validates,
typechecks, tests, builds, packs and publishes it to a GitHub release.
