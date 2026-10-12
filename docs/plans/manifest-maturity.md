# Make pack manifests dependable contracts

Status: planned. Written 2026-10-12 on `AS/feature-settings-rework`.

## Goal and sequence

The host and authoring tools should explain what a pack provides, what it needs, whether it can run,
and why it failed. Authors should discover mistakes before installation or activation, and a dependency
resolved on one machine should be explainable on another.

apack already has generated schemas and accessors, snapshots, artifact integrity checks, migrations and
host-version checks. Build on these mechanisms. The priority is completing their contracts rather than
adding fields because another ecosystem has them.

Deliver in this order:

1. Finish the [settings extraction](declarative-settings-sections.md).
2. Make declarations and diagnostics consistent.
3. Declare consumed APIs and construct the corresponding access surface.
4. Preserve dependency resolution provenance.
5. Audit lifecycle behavior and contain frontend failures.

Treat each item as a separately scoped change with its own evidence and validation. This plan is the
roadmap; the linked plans hold subsystem design. Do not implement all of them as one manifest rewrite.

## 1. Complete discovery without activation

The complete scope and acceptance criteria live in
[discovery without activation](discovery-without-activation.md).

Settings is the immediate example: app, pack and feature definitions become data that the host can read
without importing an executable settings module. Follow the dedicated settings plan for that work.

Next, inventory labels, icons, commands and other contributions. For each, distinguish the facts needed
to list or validate it from the implementation needed to execute it. Move metadata still hidden in
runtime exports into declarations only where a real consumer needs discovery before activation.

The manifest declares the contribution once; codegen derives runtime registration and snapshot metadata
from it. Avoid a second handwritten contribution inventory. Reuse the existing build pipeline and
provenance machinery instead of building a generic extension framework.

Targets: SDK manifest schema, snapshot model, `generate-entries.ts`, host registration and frontend
contribution loading. Reconcile the older [declarative contributions plan](declarative-contributions.md)
and its reference inventory against the current implementation before taking its remaining tasks literally.

Evidence: a pack with a runtime that throws on import can still be described from its built declarations.
The declared names, generated registration and discovery result agree. Existing pack behavior survives.

## 2. Share precise validation and diagnostics

Current validation mostly returns strings. `validateCodegen()` skips its checks when dependency resolution
throws, returning no errors or warnings for that phase. Other phases may warn about dependencies, but the
result does not clearly distinguish a complete check from an incomplete one.

Introduce a shared diagnostic record with a stable code, severity, owning pack, manifest path and human
message. Include a source location or actionable suggestion when available; do not require every checker
to manufacture one. CLI text and machine-readable output are renderings of the same result. Use the
same semantic checks in validation, build and install where their inputs are available.

Report valid, invalid or incompletely checked, including which checks were skipped and why. An incomplete
authoring check should remain useful offline; strict build/install gates must not mistake it for successful
validation. Decide exit-code behavior explicitly when adding machine-readable output.

Tighten existing values before adding more fields:

- `version` currently accepts a semver-looking prefix rather than validating the complete string.
- `hostVersion` is an unrestricted string in the schema, despite being interpreted as a range later.
- Export/source references use several conventions. Preserve intentional differences (component default
  exports versus named runtime exports), document them, and share resolution/checking where they overlap.
- Check dependency/reference errors at the earliest phase that has enough information; the host remains
  responsible for conflicts involving unrelated installed packs.

Targets: `manifest-schema.ts`, `build/validate.ts`, codegen export checks, CLI validate/build and installer
diagnostics. Do not regress the existing moved-key replacement hints.

Evidence: invalid semver/ranges fail at the manifest path; missing dependencies produce an incomplete
result; text and machine output report the same underlying issue; install refuses an invalid artifact
without partially changing the installed pack.

## 3. Declare consumed APIs

The manifest describes provided services, but consumed host and dependency APIs remain implicit.
`permissions` is presently displayed metadata; it does not govern service access. Resolve that mismatch
before presenting it as a permission guarantee.

Inventory actual consumption first. Define required host APIs and dependency-provided APIs, then generate
owner-bound handles exposing the intended surface. Runtime binding and generated types must agree;
ambient SDK imports must not silently bypass an authoring contract. Reuse the existing generated services
facade and module checks. Start with the APIs actually consumed by default-setup.

Use the [declared capabilities plan](declared-capabilities.md) as input, but re-audit its service list and
data access assumptions. EARS/repositories and direct Node access are separate surfaces; withholding a
service object does not contain an in-process JavaScript pack. Call the feature an API dependency contract
unless there is an enforcement boundary supporting a stronger claim.

Evidence: an undeclared API is unavailable through normal generated access, required unavailable APIs
produce an actionable failure, and tests can provide only the declared dependencies. An explicit shared
API remains usable by dependent packs. Document the actual trust model.

Optional dependencies should wait for a concrete integration that can operate without its provider.
When needed, distinguish absent optional integration from a broken required dependency and load only
the associated contributions; do not scatter provider-presence checks through feature code.

## 4. Preserve dependency provenance and reproducibility

Resolution currently considers workspace, linked checkout, installed app, cache and network sources.
Ranges and downloaded artifact integrity are already checked. `fetch-deps.ts` explicitly notes that cache
entries lose their source, so the same cached version cannot explain where it came from.

Record exact version, source and content identity with the existing cached dependency artifact. Show that
information through existing inspection/doctor tooling. Distinguish declared range from resolved version,
and source location from identity; a local directory can change without moving.

When distribution requires repeatable resolution, add a frozen mode that uses recorded identities and
refuses a changed/unavailable dependency instead of selecting another machine-local candidate. Design its
lock metadata around the existing resolution pipeline, after provenance is reliable. Do not add a package
manager, registry, or redundant checksum system as part of this step.

Evidence: a cache hit retains origin; two resolutions expose why their artifacts differ; development
can intentionally use a linked build; frozen resolution cannot silently substitute that build for the
recorded artifact.

## 5. Make lifecycle and failure behavior explicit

Audit registration, replacement, disable, reload and uninstall for each contribution kind. Identify its
owner, collision/replacement policy, cleanup and observable notifications. Preserve intentional merging
of facets; exclusive ownership and multi-owner folding are different contracts.

Use the existing undo log and stores. Add shared implementation only when multiple contribution kinds
actually need the same behavior. Test that a failed registration does not remove another owner's data,
that replacement drops stale contributions, and that disposal removes listeners/resources.

Add frontend error boundaries around pack panes and forms with the pack named in the failure, a useful
recovery path and error reporting. The shell should remain usable when a contributed component throws.
Follow the cheap half of [pack fault isolation](pack-fault-isolation.md), checking what already landed.

Lazy activation is a separate, measurement-gated follow-up: attribute boot cost before changing when
packs run. Derive activation from existing contributions where possible instead of making authors repeat
command/view declarations in an activation list. Preserve migration/content ordering and event delivery.
Use [lazy activation](lazy-activation.md) for the measured design.

Out-of-process backend packs are deferred. Synchronous EARS access makes this a data-contract redesign,
not simply a process-spawning task.

## Contract maintenance alongside every step

Make schema descriptions, public docs, templates and actual runtime behavior agree. Two current audit
targets illustrate the problem:

- `builtIn` is author-declared, while runtime origin determines shipped provenance and the registry says
  it does not decide behavior from that field. Remove the inert declaration or define a concrete consumer;
  do not let pack authors assert trusted origin.
- The feature `references` schema description still says external packs are ignored despite newer
  codegen support. Correct the description and cover the supported external case.

Regenerate schemas/API reports when the public surface changes. Apply the repository's snapshot-format
rule when a reader would misinterpret a changed contract; do not bump package release versions. Update
existing plans if new evidence invalidates their assumptions, rather than leaving contradictory roadmaps.

## Research informing the direction

- [VS Code extension manifests](https://code.visualstudio.com/api/references/extension-manifest) distinguish
  contribution metadata, executable entry points, compatibility and dependencies. Adopt those meanings,
  not every marketplace field.
- [VS Code activation events](https://code.visualstudio.com/api/references/activation-events) document
  activation inferred from contributed commands/views. This supports deriving repeated facts.
- [JetBrains plugin dependencies](https://plugins.jetbrains.com/docs/intellij/plugin-configuration-file.html#depends)
  distinguish required providers from conditional integrations. Add that distinction when apack needs it.
- [Chrome permission declarations](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
  correspond to constrained API access. This is a useful comparison, not evidence that apack's current
  in-process manifest labels enforce the same boundary.

## Validation and scope

For each implemented item, use focused specs at the affected boundary, extend the external-pack fixture
when authoring behavior changes, regenerate changed contracts, and run `npm run chain`. Add targeted app
checks for lifecycle/error presentation. Check complete behavior, not just schema acceptance.

Keep marketplace categories, optional integrations, a new activation language and process isolation out
of the immediate work unless their named product or measurement trigger exists. Complete the settings
plan first; use the remaining priorities to scope subsequent changes.
