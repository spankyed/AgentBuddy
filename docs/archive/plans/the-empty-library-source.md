# default-setup's `library` content source is declared and empty

Status: **closed, 2026-10-23** — the entry is gone with the format it existed for. Documents became SDK
content keys (`documents`, `commands`), compiled and applied by the SDK, so default-setup declares no
library format or source, and `tests/content/harness.ts` applies its fixtures' documents with the SDK's
`createDocumentsApplier()` — the fix proposed below under "What would actually fix it", with the
factory removing the drift it warned of. What follows is the analysis as it stood.

Compiled 2026-10-22 on `session/commands-to-the-editor`, after the commands moved out of
`src/content/library/internal/commands/` and left that tree empty.

## The anomaly

`packages/default-setup/apack.json` declares:

```json
"library": { "path": "src/content/library", "format": "library" }
```

That path holds no files — it does not exist. The entry compiles to zero records, and it is declared
because **codegen emits one applier per `content.sources` key**
(`src/__generated__/appliers.ts`): drop the entry and there is no `library` applier.

## Who actually needs that applier, which is not who it looks like

**Not a dependent pack.** A dependent declares its own source naming the format, and codegen builds
*its* applier from that format's declaration. `tests/packs/external-pack`'s generated appliers prove it:

```ts
createFormatApplier({"key":"commands","entities":["Collection","Document"],"identity":["name"]}),
```

That pack declares no `library` source and never sees default-setup's appliers —
`importCompiledContent` reads the pack id from the compiled directory's `content.json` and runs only
*that* pack's. `content.formats` and `content.sources` are independent declarations, so the `library`
format stays available to dependents whether or not default-setup declares a source using it.

**The consumer is this pack's own test harness.** `tests/content/harness.ts` compiles the `v1`/`v2`
fixture trees through default-setup's manifest entries and applies them *as default-setup's content*, so
writing their library records needs default-setup's own `library` applier. `PARITY_KEYS` includes
`library`, and the harness falls back to `{ format: key }` when the manifest has no entry — so
compilation survives the entry's removal and only the **apply** does not.

Not confirmed by experiment: removing the entry during this session broke something, and the reasoning
above identifies the harness as the cause. The check that would settle it is to drop the entry and see
whether anything outside `tests/content/` fails.

## Why "an applier per declared format" is the wrong fix

The idea this plan replaces: have codegen emit an applier for every `content.formats` entry that
declares `entity`, not only for every source. It does not work, and the reason is a namespace
confusion worth keeping written down.

**An applier is keyed by a content key; a format has a name; the two are different namespaces.** They
coincide in default-setup only because it names its sources after its formats. external-pack's applier
is keyed `commands` because its *source* is called `commands` — had it declared
`"slash": { "format": "default-setup:commands" }`, the key would be `slash`. So an applier derived from
a format would be keyed by the format's name, which no compiled directory ever contains, and it would
never run. The mechanism would add an applier to every pack declaring a format for someone else to use,
and none of them would match anything.

## What would actually fix it

**The harness supplies the applier its fixtures need**, instead of the pack declaring a phantom source
for it. There is already precedent in the same directory: `tests/features/library/be/commands.spec.ts`
registers a dependent pack with hand-written appliers, `createFormatApplier({ key: 'library', … })`
among them. The pack's manifest would then describe only content the pack ships.

The cost is that the harness hand-writes what codegen derives from the format declaration, so the two
can drift — a fixture applying with different `identity` or `entities` than the real format would pass
while testing something else. Worth checking whether the harness can read the format out of the
manifest it already parses, rather than restating it.

## The seam

- `packages/default-setup/apack.json` — the `content.sources.library` entry to remove.
- `packages/default-setup/tests/content/harness.ts` — `PARITY_KEYS` and `compileContent`, which already
  reads `manifest.content.sources`, plus wherever the fixture apply would register the applier.
- `packages/apack-sdk/src/build/generate-entries.ts` — unchanged; this plan exists to say that.
