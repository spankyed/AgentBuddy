# Declarative contributions: current boundary and planned discovery

Status: current-code reference, revised 2026-10-12. The implementation target is
[discovery without activation](../plans/discovery-without-activation.md); ordering and transferred
manifest decisions live in [manifest maturity](../plans/manifest-maturity.md). Re-audit exact API names
after the in-flight naming goal. This reference is not a competing implementation plan.

## What is already data

`apack.json` names features, dependencies, host compatibility, entity/relation names and many keyed
extensions: steps, artifacts, blocks, commands, services, DSL and frontend slots. Built snapshots carry
manifests, facade/type artifacts and partial provenance. Compiled content and integrity indexes already
exist. Offline database tooling reads schema data without pack runtime imports.

This is partial discovery, not an absence of discovery. A keyed declaration identifies a contribution;
its executable path is a binding reference, not a reason to execute it when listing its existence.
See [extension authoring](../public-facing/extensions.md) for the current manifest grammar.

## What still depends on executable registration

Generated backend/frontend entries import implementation modules and assemble registration objects.
Some static facts are embedded in those objects rather than exposed in a complete data artifact:

- Plugin labels, icons, default-navigation claims and pane metadata.
- Feature settings schemas/defaults and globally merged `settingsSections`.
- Reference protocols/categories and anonymous editor contribution lists.
- Help articles, some step palette metadata and generated event contracts.

Current readers combine installed declarations with runtime registration: settings unions installed and
registered feature refs, pack details lose extension information while inactive, and shell navigation
learns destinations/default claims as frontend imports finish. The discovery plan records the exact
consumer/refactor inventory. The old claim that events are the only remaining gap is incorrect.

## The intended boundary, not yet implemented

Build produces a complete validated descriptor plus indexed static data/assets. A host catalog exposes
those facts for installed packs without importing executable modules. Activation binds implementations
to already-known declarations; it cannot silently add another inventory. Definitions are authored once
and generate both views. Build-time code evaluation is distinct from discovery-time execution.

Settings use the common catalog with the ownership/schema/access contract from
[settings architecture](../plans/settings-architecture.md). Static metadata is available while
inactive; forms, actors, providers and handlers require actual execution. The catalog reports declared,
eligible and active status separately.

## Checks move earlier; rollback remains

Descriptor ownership and compatibility checks can run before activation. Runtime binding checks still
protect against mismatched artifacts, and executable registration can fail after acquiring resources.
Keep owned contribution stores, undo logs, teardown and replacement rollback. Knowing an actor's address
or event contract does not make the actor ready; catalog discovery cannot replace delivery handshakes.

Dynamic provider results, component rendering, migration effects and user-specific applied rows remain
runtime behavior. In-process contract enforcement is not a security sandbox. Follow the separate
[security design](../goals/goal-pack-security-isolation.md) for confinement and permissions.

## Contracts to maintain

Descriptor/codegen/runtime freshness must agree, including in source/HMR workflows. A failed rebuild
retains the last valid committed view and reports staleness. Installed descriptor inspection must never
activate code to fill a missing field. Unsupported/malformed artifacts receive explicit diagnostics.

[Recorded artifacts](recorded-artifacts.md) documents artifact derivation rules. The discovery plan owns
coverage fixtures, import-time-throw proof, consumer regressions and format/API checks. Historical plans
in the archive preserve earlier proposals; their example manifests are not current schema instructions.
