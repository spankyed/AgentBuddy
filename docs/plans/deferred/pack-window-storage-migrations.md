# A pack moves its own window-storage names

Status: deferred, and deliberately empty-handed. Nothing needs it: no one runs the app, so a pack
renaming a stored name today simply renames it. **Revisit when a released build has users whose window
storage would be orphaned by a rename** — that is the condition, and until it holds this mechanism would
ship with zero entries.

Compiled 2026-10-22 on `session/plugins-to-surfaces`, after
[the surface rename](../../archive/goals/goal-plugins-to-surfaces.md) gave every pack a scoped storage
handle.

## Context

`surfaceStorage(ref)` / `useSurfaceStorage()` (`@apackdev/sdk/fe`) prefix every name a surface stores
with its own ref, so a key is `default-setup/code:open-tabs` rather than a string someone typed. The
`window-storage` pack rule refuses raw `localStorage`/`sessionStorage` in pack source, so the prefix
cannot be bypassed.

What moves window storage forward today is host-only: `runWindowStorageMigrations`
(`packages/apack-host/src/fe/window-storage/`), one versioned file per app release, run from
`renderer/src/main.ts:50` before the shell and recorded under `apack-window-storage-version`. A pack
cannot contribute to it.

## What is actually missing

Three cases, and only one of them is a gap.

**A ref changes** — a pack id or feature id is renamed, orphaning that whole namespace. The host can
already do this generically, because it owns the prefix convention: rewrite `old-ref:` → `new-ref:`
across every name, in one versioned file, with no pack code involved. This was impossible before keys
were namespaced, and it is the case with real value: roughly twenty lines in the existing runner,
whenever a ref actually moves.

**A pack renames a stored name** (`open-tabs` → `tabs`) **or changes a stored value's shape** — needs
the pack's own intent, and there is no mechanism. This is the gap this plan is about.

## The design, when it is wanted

**Run at registration, not at boot.** The binding rule is not "all window migrations before the shell";
it is *a key's migration must precede the first read of that key*. The host's keys are read by the shell
as it starts, which is why its runner is at `main.ts:50`. A pack's keys are read by the pack's own
frontend, which runs only after its module has loaded and registered — so registration is both late
enough to have the pack's code and early enough to precede any of its components.

A pack declares them in its frontend registration, keyed by its own version:

```ts
windowStorage: {
  '0.2.0': { description: 'open-tabs became tabs', up: (storage) => { /* already scoped */ } },
}
```

and the host runs them where a pack's frontend registers, before anything of that pack mounts:

```ts
function registerPackFE(pack, frontend) {
  runPackWindowStorageMigrations(pack.id, frontend.windowStorage, surfaceStorage(refOf(pack)));
  // records apack-window-storage-version:<packId>
  …existing registration…
}
```

Two properties worth keeping:

- **`up` receives the scoped handle**, never raw storage, so a pack cannot reach another pack's keys even
  in a migration.
- **The version is recorded per pack, against the pack's own version**, mirroring `runPackMigrations`
  and `AppState.packVersions` on the backend. One mental model for both lines matters more than the
  mechanism.

## Cost, and why that argues for waiting

The per-pack mechanism is roughly eighty lines plus a registration key, a schema entry and its specs.
The generic ref-prefix case is twenty lines in a file that already exists. Neither has a caller today.

## Two corrections this plan exists to record

The first survey of this claimed a pack **could not** own its window migrations, because
`runWindowStorageMigrations` runs before any pack has contributed anything. That generalised the host's
constraint to everyone and was wrong: the ordering requirement belongs to each key's reader, not to the
boot.

The second was reaching for the mechanism before the namespace. Most of what a per-pack migration would
have carried — `code-plugin-open-tabs` among it — stopped existing once the prefix was derived from the
ref rather than typed by hand. A mechanism for managing bad keys is worth less than keys that cannot go
bad.
