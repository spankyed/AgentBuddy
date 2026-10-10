# Declarative contributions: what a pack could say about itself without running

Why this is a reference and not a plan: nothing here has been decided, and the measurement that would decide
it has not been taken. What is here is the shape of the question — today's three layers, where each one
fails, what a declarative contract would look like against this pack's real manifest, and the footguns the
industry has already found. Read it before proposing lazy pack activation, install-time collision checks, or
any tooling that wants to describe a pack without loading it.

The sibling reference is [`recorded-artifacts.md`](recorded-artifacts.md), because every field this document
proposes lifting becomes a member of the derivation family it describes. That is the whole cost.

## Today's three layers

**1. `abuddy.json` — 28 root keys, and two shapes among them.** Most contribution keys declare *where the
code is*. One declares *what the items are*:

| key | what it declares |
|---|---|
| `steps` | `{ register: path, build: path, definitions: [{ type, path, kind?, dsl? }] }` |
| `blocks` | a path |
| `artifacts` | a path |
| `dsl` | `{ entry: path, targets, prefix, globals }` |

`steps.definitions` is the precedent for everything below, and the schema says why it exists: *"Step
definitions for codegen."* It was lifted because a consumer — flow-helper generation — needed the item list
without running the pack.

**2. `generate-entries` — the compiler.** It reads the manifest and each feature's declared *leaf* modules
(`be/contract.ts`, `fe/contract.ts`), then emits `src/__generated__/pack-entry.ts`: a static import graph
over every system machine, settings module, step/artifact/block barrel, migration list, applier and content
writer, assembling one `PackRegistration` literal.

**3. `PackRegistration` — the runtime object.** `registerPack` (`abuddy-host/src/packs/registry.ts`) checks
collisions against it, then walks a `contributions` table (`packs/extensions.ts`) where each entry hands back
an undo.

**The fact worth seeing before anything else.** The generated entry contains lines like

```ts
plugin: { receives: ['NOTE.OPEN', 'NOTES_CONNECTED', 'NOTE_CREATED', /* … */] },
```

That is static data, already derived from a declared type, compiled into a JS object literal inside a 928 KB
bundle. The information was never dynamic. Only its delivery is: the host learns which events the notes
plugin accepts by `require`-ing a bundle that statically imports eleven XState machines.

## Where today's shape fails

- **Discovery requires execution.** `loadAppPacks` must load the whole backend to learn anything, so there is
  no lazy activation and boot pays for every installed pack whether or not it is used.
- **Collision detection is at boot, and needs rollback.** `registry.ts` throws on EARS, service, repository
  and designation collisions; the `Contribution`/`UndoLog` machinery exists because *"an entry can throw
  partway through its own items"*. That apparatus is downstream of discovering contributions by performing
  them.
- **Two sources that can disagree silently.** The manifest names `features[].plugin.contract`; codegen bakes
  `receives: [...]` into the entry. Stale codegen means the registration describes a contract the sources no
  longer have — and codegen's staleness hash covers *every file under `src/`*, because it reads sources.
- **Tooling sees two fields.** `readInstalledSchema` reads `manifest.entities` and `manifest.relKinds` and
  nothing else: that is the entire set of things the host can learn about an installed pack without running
  it. It is load-bearing — `abuddy db` opens a data dir with no pack code at all — and it is the existence
  proof that the declarative path works.
- **Failure is late and all-or-nothing.** A pack whose module throws on import contributes nothing, and the
  app finds out at boot.

## The example, against this pack's real manifest

### Before — authored today

```jsonc
{
  "id": "default-setup",
  "entities": { "Note": "Note", "Document": "Document", "Collection": "Collection" },
  "relKinds": { "MENTIONS": "mentions" },

  "features": {
    "notes": {
      "id": "notes",
      "settings": "src/features/notes/settings.ts",
      "system": {
        "entry": "src/features/notes/be/system.ts",
        "contract": "src/features/notes/be/contract.ts#Contract"
      },
      "plugin": {
        "entry": "src/features/notes/fe/plugin.ts",
        "contract": "src/features/notes/fe/contract.ts#Contract"
      },
      "references": "src/features/notes/fe/references",
      "services": {},
      "repositories": {
        "noteQueries":  "src/features/notes/be/repository/index.ts#noteQueries",
        "noteCommands": "src/features/notes/be/repository/index.ts#noteCommands"
      }
    }
  },

  // per-item metadata already — the precedent
  "steps": {
    "register": "src/extensions/steps/register.ts",
    "build":    "src/extensions/steps/build.ts",
    "definitions": [
      { "type": "action", "path": "src/extensions/steps/action", "dsl": { "custom": true } },
      { "type": "llm",    "path": "src/extensions/steps/llm",    "dsl": { "primaryField": "prompt" } }
    ]
  },

  // …and the ones that are a path and nothing more
  "blocks":    "src/extensions/blocks/register.ts",
  "artifacts": "src/extensions/artifacts/register.ts"
}
```

What the host cannot learn from this: which block types exist (9 display, 9 input), which artifact types exist
(16), or which events the notes plugin accepts.

### After — authored

Two keys change, and both generalise `steps.definitions` to its siblings. `BlockDefinition` is
`{ type, kind?, fe?, be? }` and `ArtifactDefinition` is `{ type, fe? }`, so in both cases the identity is
already separable from the facets:

```jsonc
{
  // … entities, relKinds, features unchanged …

  "blocks": {
    "register": "src/extensions/blocks/register.ts",
    "definitions": [
      { "type": "markdown", "kind": "display", "path": "src/extensions/blocks/markdown" },
      { "type": "approval", "kind": "input",   "path": "src/extensions/blocks/approval" }
    ]
  },
  "artifacts": {
    "register": "src/extensions/artifacts/register.ts",
    "definitions": [
      { "type": "todo", "path": "src/extensions/artifacts/viewers/todo" },
      { "type": "diff", "path": "src/extensions/artifacts/viewers/diff" }
    ]
  }
}
```

Note what is **absent**: there is no `activationEvents` key. Activation is derived from the contributions —
see the footgun below.

### After — generated, and this is the half that matters

`plugin.receives` must never be hand-written: it is derived from the plugin's `Contract` and a hand copy would
drift on the first edit. So the build resolves the authored manifest into an artifact the host reads, beside
the `manifest` the snapshot already carries:

```jsonc
// dist/runtime/contributions.json — @generated by `abuddy build`, held by a derivation check
{
  "id": "default-setup",
  "format": 1,
  "entities": { "Note": "Note", "Document": "Document", "Collection": "Collection" },
  "relKinds": { "MENTIONS": "mentions" },

  "features": {
    "notes": {
      "designation": null,
      "services": [],
      "repositories": ["noteQueries", "noteCommands"],
      // derived from fe/contract.ts#Contract — the literal baked into pack-entry.ts
      // today, lifted out of the bundle
      "plugin": { "receives": ["NOTE.OPEN", "NOTES_CONNECTED", "NOTE_CREATED", "NOTE_UPDATED"] },
      // derived from be/contract.ts#Contract
      "system": { "receives": ["CREATE_NOTE", "DELETE_NOTE", "SEARCH_NOTES", "UPDATE_NOTE"] },
      // where the behaviour is, resolved only on activation
      "load": { "system": "#system/notes", "plugin": "#plugin/notes", "settings": "#settings/notes" }
    }
  },

  "steps":     [{ "type": "action", "kind": "step", "dsl": { "custom": true }, "load": "#step/action" }],
  "blocks":    [{ "type": "markdown", "kind": "display", "load": "#block/markdown" }],
  "artifacts": [{ "type": "todo", "load": "#artifact/todo" }],
  "commands":  [{ "name": "pr2md", "placeholder": "PR number or GitHub URL (optional)" }]
}
```

`load` is an opaque key into the pack's bundle: the one thing that still requires executing code, and only
when something needs that contribution.

## What moved, and the test that decides each field

The test for any field is **does something outside the pack need to know this before the pack runs?**

| | before | after | why |
|---|---|---|---|
| block / artifact types | inside a 928 KB bundle | declared per item | the renderer routes on the type; it should not need the component to know one exists |
| `plugin.receives` | generated literal *in* the bundle | generated *into* the artifact | the bus validates every send against it |
| collision inputs (entities, services, repositories, designations) | discovered by registering | readable at install | moves the throw from boot-with-rollback to an install-time refusal |
| activation | implicit "load everything" | derived from contributions | see the footgun below |
| machines, step `compile`, components | in code | **still in code**, behind `load` | only the host needs them, and only when activating |

## Footguns

- **The drift tax is the whole cost.** Every lifted field is a second thing that can disagree with the
  implementation, so each one needs codegen *from* the source plus a check — never a hand-written
  declaration. `contributions.json` would be a fifth member of the family in
  [`recorded-artifacts.md`](recorded-artifacts.md). Hand-writing `plugin.receives` would be strictly worse
  than today.
- **Declare activation, or derive it — never both.** VS Code shipped explicit `activationEvents`
  (`onCommand:foo`), watched them rot against `contributes`, and from v1.74 derives activation implicitly
  from the contribution points. Declaring both guarantees drift.
- **Lazy activation moves failure from boot to first use.** Today a broken pack is a load problem the Packs
  view shows at startup; lazily it surfaces mid-flow. The answer is probably: validate the manifest eagerly at
  install, load behaviour lazily, and treat a load failure as a pack-level fault.
- **Roles must resolve without activation.** `getDesignated('brain')` has to answer before the brain pack's
  code runs, or lazy activation deadlocks on itself. Designations are already declarative; that is the
  invariant to protect.
- **Entity types must stay eager.** Every pack registers before `store.hydrate()` so the partition policy sees
  all types. Entities are already declarative, which is why this works — and why entity declaration can never
  become lazy.
- **The module bridge has to be permanent.** Loading pack code at arbitrary later moments means
  `Module._resolveFilename` must resolve `@abuddy/*` whenever a pack lazily requires one. A bridge scoped to a
  boot-time load cannot survive lazy activation (`packs/runtime/bridge.ts`'s
  `keepHostModulesResolvable` is that shape).
- **The undo log stays.** Packs are removed and reloaded at runtime, so `Contribution`/`UndoLog` is still
  needed. Declaring contributions removes the rollback-on-partial-failure case, not the mechanism.
- **"Declarative" will not mean pure JSON.** `settingsSections?: () => Record<string, unknown>` and
  `help?: () => HelpEntry[]` are already **thunks**, called lazily so a pack whose defaults come from compiled
  content can read them at call time — a micro-version of the same problem, already solved the same way. The
  end state is a manifest of metadata plus lazily-resolvable references, not data.

## Industry fit

- **VS Code** — `contributes` in `package.json` declares commands, menus, languages, grammars, settings and
  views; code loads on activation. The closest analogue, and the source of the activation footgun above.
- **Eclipse** — `plugin.xml` extension points with lazy class loading. The same idea, twenty years older.
- **npm itself** — an `exports` map is pure data, resolvable without executing the package. This repo already
  leans hard on that (the `@abuddy/source` condition, `stagePublishTree`).
- **Kubernetes CRDs** — declare the schema, validate at admission, implement in a controller: the
  collisions-at-install move, generalised.
- **The deliberate counter-example** — ESLint flat config, Vite and webpack configs are *code*, chosen for
  expressiveness, and they pay for it in tooling that cannot introspect them. Worth knowing because the trade
  is real and sometimes runs the other way. Those are configuration, though, not a contribution registry a
  host must index across many parties.

The principle underneath all of them: **declare what another party must know about you; implement what only
you must know.**

## What would decide it

This buys a **capability** — lazy activation and install-time validation — not less code. It adds members to
the derivation family and removes none.

So the input that decides scope is a measurement nobody has taken: **what boot currently spends executing
pack backends.** It is 928 KB for the one pack that exists today. If that is 150 ms, the collision-timing and
tooling wins alone probably do not justify a contract migration; if it is seconds and grows per installed
pack, the case makes itself. Take that number before scoping anything, and lift fields one at a time against
the test above rather than converting the contract wholesale.
