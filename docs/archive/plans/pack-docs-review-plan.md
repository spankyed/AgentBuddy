# Pack Authoring Docs — Review Plan

Goal: investigate the pack infrastructure to understand what needs to be documented for external pack authors. This plan directs the research phase — what to look at and what questions to answer — not the docs themselves.

## 1. Walk the author lifecycle end-to-end

Trace what a pack author actually does from zero to running pack. Follow the CLI commands (`abuddy init`, `build`, `pack`, `install`, `dev`) and note every file, config, and convention they touch. Identify the happy path and where it can break.

## 2. Audit the SDK surface

Examine `packages/sdk/` — its `package.json` exports map, the public types, and the helpers each export path provides. Determine what's intended for external consumption vs internal plumbing. Flag anything that's exported but unclear or undocumented.

## 3. Catalog the extension points

List every capability a pack can register (systems, services, steps, EARS entities, artifacts, blocks, tiptap extensions, app extensions, boot hooks, migrations, seeds, FE plugins). For each, find the registration shape/type and an example of it being used (default-setup is the reference implementation).

## 4. Review the manifest contract

Read the `abuddy.json` schema — required fields, optional fields, what each controls. Check if there's validation logic (in the CLI or loader) that enforces constraints not obvious from the types alone.

## 5. Trace the build and packaging pipeline

Follow what `abuddy build` and `abuddy pack` do — bundler config, output structure, what ends up in the .tgz. Understand constraints on the built output (CJS vs ESM, host resolution, external dependencies).

## 6. Map the runtime constraints

Identify what external packs can and cannot do — blocked features (earlySystem, partitionPolicy), collision rules, host version checks, sandboxing boundaries. Find where these are enforced.

## 7. Check the FE entry contract

Understand what a pack's FE entry (`dist/fe.js`) must export, how it gets loaded, and what APIs are available to pack UI code (actor system access, trpc, SDK FE helpers).

## 8. Review dev workflow

Look at `abuddy dev` (watch mode), how authors test locally, and whether there's a hot-reload or restart cycle. Note any dev-only setup steps.

## 9. Compile open questions

After the above, list anything that's ambiguous, inconsistent, or where the code does something the types don't explain. These become sections that need design decisions before they can be documented.
