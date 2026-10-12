# Finish the app settings extraction

Status: planned. Revised 2026-10-12 on `AS/feature-settings-rework`.

This replaces the earlier plan to make globally named settings sections exclusive. The work is an
ownership and service redesign, not merely removal of the `settingsSections` thunk.

The projects audit and external research are folded into the decisions below. Keep `app.projects` as
ordered directory configuration; use `extensions.settings` for pack-local preference groups; compose
explicit defaults before pure validation; and reuse the existing accessors and request correlation.
JSON Schema is the common target definition for app, pack and feature preferences. The remaining
implementation checkpoints are the existing feature-constraint audit, generated type facade, custom-form
loading, and assistant lifecycle state destination. They do not reopen the three-owner document design.

## Product goal

Application preferences work without default-setup. Packs can declare preferences shared by their
features without editing the host. Features retain their own preferences. Every consumer reads the
same authoritative settings, whether or not the Settings page has opened. Resetting preferences does
not reset assistant identity lifecycle or restart onboarding.

## What is incomplete today

The host owns persistence, writes and notifications, but default-setup still defines `general`,
application shortcut defaults and assistant settings. The renderer has built-in Personal, Projects
and Application forms while treating their data as opaque pack contributions and duplicating types.
The host reads `general.application.hotkeys`, so that supposedly opaque shape is already an app contract.

`settingsSections` is a function called synchronously during registration despite documentation claiming
lazy evaluation. Sections merge globally with silent last-wins collisions. More importantly, the renderer's
settings port reads the Settings view actor's context and sends writes through that view. Presentation
still acts as the source of settings for other features.

Threads writes `assistant.birthdate` and uses it to gate onboarding. That combines an editable preference
with lifecycle state and makes the chat feature responsible for an assistant shared by the pack.

## Ownership and document shape

| Owner | Responsibility | Examples |
|---|---|---|
| App | Preferences guaranteed independently of installed packs | Shell hotkeys, personal details, shared project configuration |
| Pack | Preferences shared by its features | Default-setup assistant display name |
| Feature | Preferences belonging to that feature | Code terminal preferences, Threads chat preferences |

One host settings engine composes defaults and stored overrides for all three. The target effective
shape is:

```json
{
  "app": {
    "hotkeys": {},
    "personal": {},
    "projects": []
  },
  "packs": {
    "default-setup": {
      "assistant": { "name": "" }
    }
  },
  "features": {
    "default-setup/code": {}
  }
}
```

`General`, `Application` and `Assistant` are navigation labels, not document roots. There is no arbitrary
root section or miscellaneous `extras` bucket. A pack owns `packs[packId]`; a feature owns its resolved
ref. Two packs may both declare `assistant` without conflict. They cannot contribute app defaults or
replace another owner's preferences through their declarations.

Host implementation owns app defaults and validation. Shared browser-safe types and access contracts
live in the SDK so packs and the renderer do not import private host implementation or duplicate types.
Feature ownership stays under `features.<id>.settings`; its definition changes from an executable
Zod module to the same data contract used for app and pack preferences.

## Declaration and authoring interface

Pack settings are inline manifest declarations under `extensions.settings`, keyed by a local group
name. Replace the old `settingsSections` name as well as its contract: these are pack preferences,
not contributions to arbitrary app document sections. Keep `features.<id>.settings` for feature-owned
preferences; `extensions.settings` is for pack-owned preferences shared across features.

```json
{
  "extensions": {
    "settings": {
      "assistant": {
        "label": "Assistant",
        "defaults": { "name": "" },
        "schema": {
          "type": "object",
          "properties": { "name": { "type": "string" } },
          "required": ["name"],
          "additionalProperties": false
        }
      }
    }
  }
}
```

Defaults are JSON data, not an export target, function or compiled content entry. Require explicit
`defaults` and `schema` for writable app, pack and feature preferences. Defaults are the complete baseline object; optional
fields may be absent. The schema describes valid effective values, not the sparse stored overrides.

Use JSON Schema draft-07 as the common settings schema format. Start with ordinary objects, arrays, primitives,
nullable values, enums, required fields, constraints and document-local references. Avoid remote schema
resolution and custom keywords. Use a maintained validator and declaration generator instead of writing
a schema-to-Zod or schema-to-TypeScript translator. The first implementation checkpoint must prove the
chosen tools on optional fields, nullable values, records, enums and arrays; reject unsupported authoring
shapes explicitly rather than silently generating an incorrect facade.

Ajv 8 is the proposed backend validator; `json-schema-to-typescript` is the proposed build-only type
generator. Neither is a direct dependency of the SDK today. Add declared dependencies in the appropriate
packages rather than use tooling's transitive installations. Compile/check validators once per declaration
change, not on every read. Keep validator compilation out of renderer form rendering.

The repository uses Zod 3.25 today. Audit every existing feature settings schema before conversion:
list refinements, transforms, defaults, shared schemas and constraints, then map each to JSON Schema
or an explicit domain responsibility. Preserve valid values, default behavior and meaningful refusals;
do not silently widen a schema to make conversion easy. If an essential constraint cannot be expressed,
resolve that concrete case before converting its declaration. Avoid a general custom-keyword system.

Migrate app and feature settings definitions to the same `schema` plus `defaults` contract as pack groups.
Host app definitions live in host-owned source data. Pack and feature definitions are manifest data,
inline or in local JSON files resolved and embedded at build time. Built snapshots must carry complete
schemas and defaults so installed settings discovery requires no executable settings module. Keep existing
feature form paths and visibility semantics; presentation metadata is independent of value validation.

Reuse the current writer and normalize JSON Schema issues into its refusal contract. A temporary adapter
may support old feature declarations during implementation, but the completed work has one settings schema
format and no retained Zod settings authoring API or compatibility alias. Zod used by unrelated APIs,
manifests and domain code is unaffected; no repository-wide Zod upgrade is required.

The common definition supports runtime validation, JSON editor completion/descriptions/errors, generated
TypeScript accessors and discovery of installed settings without pack activation. Wire the composed schema
into the existing advanced editor as part of delivery; these benefits require integration rather than
appearing automatically when the schema is declared. Schema metadata remains available to custom forms,
help and tooling. This does not introduce generated forms.

JSON Schema `default` is an annotation and does not populate missing values. Keep actual defaults in
`defaults`; do not maintain a second baseline through nested schema defaults. Disable coercion, default
insertion and removal of additional properties. Check the declared baseline against its schema, then
validate each candidate effective value without modifying it. Retain the existing handling of unchanged
invalid legacy values, with consistent issue paths for all owners.

Generated types describe structure, optionality and representable alternatives. Numeric ranges, patterns
and other constraints remain runtime checks; do not promise that every invalid value is a compile error.

An optional `form` source path belongs beside `label`, `defaults` and `schema`. Use the existing feature
form convention (a component's default export) rather than another export-target syntax. Load it through
the pack frontend contribution registry, never the backend registration's imports. The form receives
readonly effective values and emits the same typed setting updates as feature forms. The host supplies
save results, resets and navigation. Without a form, expose the group through typed access and the advanced
editor; do not show a blank editable page. Keep all forms custom.

Normal author code uses owner-bound handles, conceptually:

```ts
appSettings
packSettings.assistant
featureSettings.code
```

Reuse the existing generated accessor style rather than introduce a competing one. Backend example:

```ts
const assistant = packSettings.forSection('assistant');
assistant.get();
assistant.set({ path: ['name'], value: 'Ava' });
assistant.reset(['name']); // Remove this field's override; reset() resets the whole group.
```

Feature code keeps `featureSettings.forFeature('code')`; app access uses its SDK-defined handle. Internally,
use explicit targets for app, pack/group and feature/ref rather than a generic section string. Backend
writes remain synchronous and throw a structured refusal. Frontend handles expose readonly reactive
values, scoped subscriptions and asynchronous save/reset results. Generate pack types from the schema,
not literal defaults. Extend the existing typed path/update model across owners; arrays remain whole values.

Make absence and reset distinct: an omitted field inherits its default, `null` is a value only where the
schema permits it, and `undefined` is not a persisted update value. Use reset to remove an override. Setting
a field to today's default records an explicit choice; reset opts into following future defaults. Update
docs that currently claim every write stores only differences: targeted writes already store explicit
values, while whole-document replacement currently computes differences. Preserve that distinction
explicitly in migration and import rather than accidentally erasing intentional choices.

Whole-document access remains for backup, import, migrations and the advanced editor. It is not the
normal authoring API. Owner-bound handles prevent accidental misaddressing; they are not a sandbox for
trusted pack code. Explicit cross-owner access must name the owner and use the same writer.

## Service and frontend boundary

```text
Host app declarations + registered pack/feature declarations + stored overrides
                                      |
                         Host settings service
                             /                \
                 Backend consumers       Window settings runtime
                                              /              \
                                    Frontend consumers     Settings forms
```

Keep the existing backend store as the authority. A window-level settings runtime starts with the
application, independently of Settings plugin activation. It receives snapshots/changes, handles
reconnect and replacement, and serves the SDK frontend port. The Settings view subscribes like any
other consumer; it owns navigation and local editing state, not the shared data source.

Expose readiness explicitly so initial loading is distinguishable from a missing declaration. Preserve
subscription cleanup and immutable reads. Saves and resets return a result tied to the request; one
form's refusal or acknowledgement must not mark an unrelated form saved. Reuse the bus envelope's existing
`call`/`answering` correlation instead of inventing settings-specific request IDs. Handle disconnection and
disposal without leaving callers waiting forever. An acknowledgement is not a substitute for the snapshot
of effective values: request outcomes and data updates have separate purposes.

The snapshot needs a monotonic data revision within a backend run, distinct from the current defaults
revision. Reconnection requests a fresh snapshot and establishes a new run before accepting updates;
import/replacement publishes a complete snapshot. Reuse transport/events rather than introduce a second
store or poll through the Settings view. Whole-array editors such as Projects must detect that the value
changed since their draft began and refuse an accidental overwrite while retaining the draft. Correlated
replies alone do not solve stale writes. Implement that check at the writer for the replaced value; do not
reject an edit merely because an unrelated preference changed.

Defaults remain underneath stored overrides. Reset removes overrides and uses current defaults; it
never persists a copy of defaults. Registration validates the complete candidate before publication,
and failed registration leaves settings unchanged. Objects merge recursively; arrays and scalar values
replace, including empty arrays and permitted null. An empty object overlays defaults; it does not
clear a default object. A declaration that needs a disabled/cleared value must represent one explicitly
(for example permitted null), not rely on deletion of a default. The same composition applies to every owner.

Installed inline pack declarations can supply defaults and validation while a pack is disabled without
executing it. Build the pack preference catalog from those declarations; runtime registration must agree
with them. A source/dev registration can supply the same declaration when there is no installed manifest.
Disabling a pack removes its running behavior/form availability, not its data-only preference contract.
Uninstalling removes its declarations but preserves stored overrides for reinstall.

Apply that installed declaration behavior to feature preferences too once their schemas are data.
Disabled packs' feature and pack preferences remain readable and validated without executing their runtime.
Custom forms may be unavailable while the pack frontend is disabled; the advanced editor still uses the
installed schema. Missing or incompatible declarations do not authorize unvalidated writes: preserve
orphaned overrides and expose their unavailable status. No permanent app/pack/feature validation asymmetry
remains after conversion.

## Preferences, state and projects

Move assistant `name` to default-setup's pack settings. Put assistant initialization timestamp and
onboarding progress in an explicit persisted state owner, outside settings. Default-setup owns assistant
lifecycle behavior independently of Threads; Threads can trigger or display it. Host app onboarding
state remains the host's. Establish what each existing flag means before combining or removing it.
A preferences reset must leave those facts intact; a deliberate whole-app data reset remains separate.

### Projects audit: keep `app.projects` as configured directory bookmarks

The current shape is `{ name, directories, color }[]`. Array order controls display and the fallback
working directory; directory order makes the first entry primary. There is no Project entity, stored
project ID, project relation or independent lifecycle in the audited declarations and consumers.

- [Projects.vue](../../packages/renderer/src/views/settings/canvas/components/GeneralSettings/Projects.vue)
  and Code's [useProjectActions.ts](../../packages/default-setup/src/features/code/fe/features/explorer/composables/useProjectActions.ts)
  create, rename, reorder and remove entries and write
  the complete array. Code sometimes removes an entry when its final directory is removed.
- [Code startup](../../packages/default-setup/src/features/code/be/system.ts) picks the first configured
  directory when no explicit/current directory wins.
- Threads menus, project-select blocks and Claude Code/Codex actions select directory paths. The
  [project-select block](../../packages/default-setup/src/extensions/blocks/input/ProjectSelectInput.vue)
  submits a path, not a project reference.
- Onboarding writes the configured list and sets Code's default directory separately. Its import actions
  use the directories to find sessions; project artifacts display the same configuration.

Decision: migrate `general.projects` to `app.projects`, default `[]`, with one SDK type and host validator.
Keep the current ordered array and path-based consumers; a project repository or stable IDs would add
an identity contract no caller currently needs. Revisit when persistent resources reference a project
independently of its directories, not because the UI calls the bookmark a project.

Validate structural types and new edits consistently, including nonempty directory strings and duplicate
directory policy. Establish that policy from current intended behavior: the form rejects duplicates,
while Code's direct add does not. Preserve existing imported configurations under the legacy-value policy.
Do not require paths to exist during import or normalize symlinks/case by guessing filesystem identity.
Resetting this configuration clears the bookmarks; it does not delete directories, threads or repositories.

Two existing editing problems belong in the extraction: `Projects.vue` holds the incoming array directly,
so nested edits mutate its authoritative snapshot before save, and its debounce timer has no disposal
cleanup. Use the SDK draft helper, clean up the timer, and keep refused drafts visible. Whole-array writes
also need the stale-value check described above. Secrets remain in the secrets service.

## Delivery sequence

1. **Prove the declaration and access contract.** The projects audit is complete above. Check the
   remaining app fields and assistant lifecycle gates, and audit every existing feature schema's
   constraints/defaults before conversion. Exercise the proposed draft-07 validator/type
   generator on small real declarations, finalize form loading and typed handles, and record the results
   here before changing runtime contracts. Keep generated types structural and validation authoritative.
2. **Establish app ownership and the target document.** Define SDK types and host defaults/validation;
   teach the existing engine the three owners. Remove default-setup's responsibility for built-in
   preferences. Add the stored-data migration in the same working change so existing data can boot.
3. **Declare pack preferences and typed handles.** Replace the root `settingsSections` thunk with
   inline `extensions.settings` declarations;
   derive registration, types and qualified discovery from the manifest. Migrate default-setup assistant
   preferences and all in-tree consumers. Reuse custom feature forms and add pack form loading.
4. **Unify feature settings definitions.** Convert audited feature schemas/defaults to the common
   JSON Schema data declaration, update generated accessors and snapshots, and migrate all feature
   callers/tests. Retain custom forms and navigation metadata. Compare representative valid and invalid
   values against the old definitions, then remove the temporary Zod settings path.
5. **Separate lifecycle state.** Migrate assistant initialization facts and move their behavior out of
   Threads into the pack's explicit lifecycle owner. Test onboarding before and after migration, including
   runs waiting on provider keys. Remove obsolete preference fields and Threads ownership assumptions.
6. **Make frontend access independent of the view.** Bind the frontend port to the window settings
   runtime; move reads, subscriptions and correlated writes there. Update the Settings view and SDK
   composables to consume that interface. Retain the draft helper for explicit custom-form editing.
7. **Finish the product surface and contracts.** Align navigation with app, pack and feature forms;
   compose the advanced editor schema for completion, descriptions and diagnostics, and update reset
   targets, templates, fixtures, schema/API reports and public docs.
   Remove old accessors, duplicated types and inaccurate lazy/opaque-section prose.

Each step ends with a usable, validated implementation. Internal working stages may span the steps;
commit checkpoints must not leave old data unreadable or consumers using incompatible contracts.
Do not retain aliases or dual-read compatibility paths after migrating all callers and stored data.

## Stored-data migration

Migrate stored overrides, not effective settings:

- `general.application.hotkeys` -> `app.hotkeys`.
- `general.personal` -> `app.personal`.
- `general.projects` -> `app.projects`, preserving entry and directory order.
- `assistant.name` -> `packs['default-setup'].assistant.name`.
- `assistant.birthdate` -> the assistant lifecycle state destination established above.

Audit other stored fields before removing old roots. Preserve unknown/orphaned pack and feature overrides
through export/import and uninstall; do not discard them because their declaration is currently absent.
Define deterministic precedence if both old and new paths exist; existing destination overrides win,
with old values filling only missing destinations. Make the migration idempotent.

The host owns migration of app/document structure; default-setup owns migration of assistant semantics.
Check boot and import migration ordering: legacy documents must be transformed before the new writer
refuses their old paths, and assistant data must be moved before lifecycle startup observes it. Keep
0.4.0 as the target, preserve package versions, and test against a copied backup rather than production data.

## Evidence required to finish

- With default-setup disabled, built-in preferences, forms and shortcuts still work.
- Two external packs declare `assistant` and receive separate defaults, forms and overrides. Disabling
  either keeps both pack and feature preferences available and validated without executing its runtime.
- App, pack and feature settings share one schema contract. The feature conversion audit accounts for
  every previous constraint and default; representative acceptance/refusal behavior is preserved.
- The advanced JSON editor completes keys, shows descriptions and flags invalid values from the composed
  settings schema. Backend validation remains authoritative regardless of the editor or custom form used.
- Declarations reveal names/defaults without executing a runtime; invalid declarations fail before
  publication, and failed registration leaves existing values and notifications unchanged.
- Generated handles infer optional fields and representable alternatives, reject structurally incorrect
  updates, and resolve owners without arbitrary root paths. Runtime validation rejects invalid ranges,
  patterns and unsupported fields. Defaults/nullable values/reset follow the documented composition.
- A field explicitly set to today's default keeps that choice when the default changes; resetting the
  field follows the new default. Empty arrays replace arrays; empty objects inherit default fields;
  permitted null remains a value. All three owners behave consistently.
- A frontend consumer reads and observes settings before opening Settings, after closing it, and across
  reconnection. Concurrent saves/refusals reach the correct caller.
- Custom forms keep detached drafts, save explicitly, and reflect resets and imported data. Projects
  edits cannot mutate the source snapshot; disposal clears pending debounce work. A stale array save
  cannot erase another writer's edit and does not lose the refused draft.
- Reset restores current defaults without clearing assistant lifecycle state or restarting onboarding.
- Migrating/importing legacy stored data preserves personal details, shortcuts, projects, assistant
  preferences and lifecycle facts. Repeating the migration makes no further changes.
- Removing/reinstalling a pack preserves its overrides; unrelated owners remain unchanged.

Run focused meaningful specs at each boundary, then regenerate `apack.schema.json` and SDK API reports,
inspect the diffs, run `npm run chain`, and exercise the affected settings/onboarding flows through targeted
app tests. Check the snapshot-format contract under the existing repository rule before deciding whether
its current unreleased format needs a bump. Do not bump release versions.

## Research and reasons for the shape

These sources validate mechanisms, not a requirement to reproduce another product's architecture.

- [VS Code configuration contributions](https://code.visualstudio.com/api/references/contribution-points#contributes.configuration)
  separate declared properties from category titles and runtime access. That supports separating owner,
  display group and implementation; it does not require apack to use global dotted names or add scopes.
- [JSON Schema annotations](https://json-schema.org/understanding-json-schema/reference/annotations)
  treat defaults as metadata. This is why the explicit baseline is composed before validation.
- [Ajv schema versions](https://ajv.js.org/json-schema.html) and
  [data modification options](https://ajv.js.org/guide/modifying-data.html) support draft-07 and expose
  coercion/default insertion as modifying behavior. Use pure validation for settings writes.
- [Zod JSON Schema support](https://zod.dev/json-schema) describes conversion in Zod 4 and marks
  conversion from JSON Schema experimental. This favors direct JSON Schema settings declarations over
  upgrading Zod or relying on an automatic conversion pipeline. Existing feature constraints need an audit.
- [json-schema-to-typescript](https://github.com/bcherny/json-schema-to-typescript) documents structural
  generation and constraints TypeScript cannot express. A generated facade improves authoring; it
  cannot replace validation.

A read-only design experiment used the already installed tooling copy of Ajv 8 with data modification
disabled. It accepted a baseline with an absent optional field and an explicit nullable field, rejected
an invalid enum, a non-object project and an undeclared field, and left all five inputs unchanged. This
checks the proposed validation behavior, not the dependency packaging or generated type facade. The
type-generation and custom-form loading checkpoints remain required before implementation commits.

Ownership (`app`, pack, feature) is distinct from storage scope (user, workspace, profile). Keep the
existing single app-data context and do not introduce scope precedence to mirror VS Code. Nested
`packs[packId][group]` and ref-keyed `features[ref]` intentionally reflect the identities already used
by apack; changing feature storage solely for visual symmetry offers no corresponding behavior benefit.

## Scope

Finish ownership, declarations, typed access, frontend service extraction, custom-form integration and
stored-data migration and common JSON Schema definitions together. Retain the persistence engine,
feature ownership and custom forms. Do not
add generated forms, preference scopes/profiles, general lazy activation, a generic registry framework,
or project-domain functionality unsupported by the audit.
