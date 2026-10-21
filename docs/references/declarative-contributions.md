# Declarative contributions and static discovery

Status: current-code reference, revised 2026-10-19. The
[completed settings and pack contracts goal](../archive/goals/goal-settings-and-pack-contracts.md#outcome-2026-10-19)
records implementation and acceptance, and the archived [manifest maturity](../archive/plans/manifest-maturity.md)
roadmap the decisions behind it.

## Declaration, catalog and binding

`apack.json` declares contribution identities, ownership and static metadata. Features own their
entities and optional shape references; `data.entities` holds entities without a feature owner.
`data.relations` declares stable relation wires. Keyed extensions describe commands, services, steps,
artifacts, blocks, references, help, settings, DSL and editor/app contributions. Features also declare
purpose, systems/plugins, settings and destinations. Packs declare supported API consumption.
Lifecycle hooks and migrations have explicit declarations. The public [manifest](../public-facing/manifest.md),
[features](../public-facing/features.md) and [extensions](../public-facing/extensions.md) guides define
the supported grammar.

The build validates those declarations, checks module/export contracts and publishes snapshot data,
generated bindings, facade/type declarations, provenance and indexed assets as one verified build.
The shared entity projection preserves flat wire names and records ownership once. Shape references
name TypeScript types: build checks them and generates type imports; offline discovery does not load
their authored modules. Explicit null shapes remain untyped.

The host catalog reads built declaration data without executing pack or dependency entry modules or
requiring authored sources. It exposes contribution identities and static metadata for inactive or
disabled owners as well as active ones. Settings, pack details/help, navigation destinations/default
claims, references, palettes and editor inventories consume that data. Static flow/action dependency
edges are published; dynamic references retain their explicit dynamic status.

Activation binds executable implementations to the declared identities. Exact membership, ownership,
callability and current build identity are checked before registration/publication. Native composition
uses the same declaration/binding boundary. A binding cannot silently add a second inventory.
Build-time execution of compilers is separate from discovery-time inspection.

## Settings and runtime behavior

Host preferences, pack groups and feature settings share the schema/default/validation contract.
Pack groups live under `extensions.settings`; feature definitions live with their feature. Owner-bound
handles implement shared dependency access and optional owner-only mutation through trusted caller
identity. Current documents, reset and import use the installed catalog. Custom forms remain executable
presentation bindings; host settings and defaults remain usable without those forms or default-setup.
See the [completed settings design](../archive/plans/settings-architecture.md) for its detailed contract.

Static metadata availability does not start actors, providers, forms or handlers. Catalog entries keep
declared, eligible and active state distinct. Queries still execute their actual providers; component
rendering, migrations and user-specific applied content remain runtime behavior. Readiness delivery,
cancellation, resource teardown and pane/form error boundaries retain their own lifecycle owners.
Discovery does not imply lazy activation or a security sandbox; those remain separately scoped work.

## Publication and lasting guards

Declaration/codegen/runtime freshness must agree, including source/HMR workflows. Input observations
and required output receipts authorize coherent publication and cache reuse. A failed rebuild retains
the accepted build/view and reports the failure. Missing or malformed declaration data receives useful
diagnostics; inspection never imports executable modules to fill a missing field.

Ownership/collision checks and runtime binding validation remain necessary after static discovery.
Pre-publication failure preserves the incumbent. Activation failure is separately attributed and does
not promise rollback of arbitrary user-data effects. Owned stores, rollback and teardown remain part
of registration; known addresses and event contracts do not replace readiness handshakes.

The retained schema, generated-contract, catalog, poisoned-entry, source-free, lifetime, watch and
external-consumer checks enforce this boundary. [Recorded files](../archive/references/recorded-files.md) describes schema/API
report derivation; [the final audit](../evidence/settings-and-pack-contracts.md#final-requirement-and-source-audit--2026-10-19)
links acceptance evidence. Historical plans preserve earlier proposals, while current public docs and
schemas specify what authors write. See the [security goal](../goals/goal-pack-security-isolation.md)
for deferred confinement work.
