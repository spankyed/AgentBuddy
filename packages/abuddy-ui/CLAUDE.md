# @abuddy/ui

Vue 3 components, editors (tiptap, Monaco) and UI composables for pack frontends and the app itself. It is published as compiled ESM with vue-tsc declarations. Packs import it by subpath (`@abuddy/ui/design/button`) and, by default, use the host app's copy at runtime. Pack-facing docs: `docs/public-facing/architecture.md` (`@abuddy/ui` section), `docs/public-facing/manifest.md` (`fe.bundleUi`). Paths below are relative to `packages/abuddy-ui`.

## Layout

```
src/design/       general-purpose controls: button, dialog, tag-input, Select, Autocomplete, ColorPicker, EmojiPicker,
                  ConfirmationDialog, ContextMenuPopup, TrackedContextMenuRoot, ToastNotification, CopyButton, ...
src/layout/       panel-resizer
src/components/   app-level pieces: BaseForm, BaseNode + node-styles/node-dimensions/node-handles (flow canvas),
                  DataRenderer, Json* viewers/editors, Simple/UnifiedMonacoEditor + monaco-config/monaco-actions,
                  KeyboardShortcutInput, TNodeListItem, TipSection
src/components/tiptap/   TiptapEditor, TiptapSearchBar, internal menus (TiptapBubbleMenu, TiptapBlockMenu,
                  TiptapImageBubbleMenu, bubble-menu/*), extensions.ts + extensions/*, composables/*,
                  editor-config.ts, editor-system.ts, tiptap-theme.css
src/composables/  useClickOutside, useCollapsibleState, useContextMenu, useDebounce, useExternalFileDrag, useInfiniteScroll
src/utils/        json-detection, path-truncation (pure helpers)
scripts/exports.ts         computes the exports map; `--check` mode (the build reads it too)
tsdown.config.ts           compile config
etc/                       API and component contract reports (committed)
```

There is no barrel: every public module is its own export subpath.

## Public modules and the entry-per-component rule

`scripts/exports.ts` derives the public surface from `src/`:

- **Public** = every `.ts` file under `src/` except `*.spec.ts`, `*.test.ts`, `*.d.ts` and anything under an `internal/` directory (`isPublicModule`). No `internal/` directory exists yet.
- **An SFC is public only through a `.ts` entry next to it** with exactly this content (see `design/button.ts`):
  ```ts
  export { default } from './button.vue';
  export * from './button.vue';
  ```
  TypeScript can't resolve an exports target that is a `.vue` file, so the entry is what consumers import. An SFC without an entry is internal (`components/JsonViewerDialog.vue`, the tiptap menus, `bubble-menu/*`); other files in this package import it by relative path.
- `computeExports()` gives each public module `{ "@abuddy/source": "./src/<m>.ts", "types": "./dist/<m>.d.ts", "default": "./dist/<m>.js" }`. There are no wildcards, and the map is checked into `package.json`.

Workflow after adding, removing or renaming a public module:

```bash
npm run exports:update -w @abuddy/ui   # rewrite package.json exports
npm run check:ui-entries               # (root; part of npm run typecheck) fails on a stale map
npm run api:update -w @abuddy/ui       # regenerate etc/ reports, commit them
```

`findComponentsWithoutEntry()` scans every other `packages/*` and `tests/` for `@abuddy/ui/<path>` imports that name a `.vue` without a public entry. `exports:update`, `check:ui-entries` and `build:package` all fail on those and print the entry to add (`missingEntriesMessage`).

## API reports (`etc/`)

`npm run api:check` / `api:update` run `api:build` (vue-tsc with `tsconfig.package.json` into `.temp/api-types`, gitignored) and then `scripts/api-reports.ts`:

- `etc/<entry>.api.md` for each export (API Extractor), with `/` in the subpath written as `.` (`design.button.api.md`).
- `etc/<entry>.component.md` for each component entry (a `.ts` whose source matches `export { default } from '*.vue'`). It records props, emits, slots and `exposed` members as the TypeScript checker resolves them through `vue-component-type-helpers`. Changing a component's props, emits, slots or `defineExpose` changes this report, so run `api:update`.
- Stale reports are deleted on update. CI runs `api:check` for `@abuddy/ears`, the SDK and UI, after `packages:build`: `tsconfig.api-extractor.json` resolves `@abuddy/*` dependencies to their built declarations, since API Extractor analyses `.d.ts` and follows a dependency read as source into it instead of reporting it as an import.
- The reports carry API Extractor's messages (`scripts/api-reports.ts` sets them explicitly, because `ExtractorConfig.prepare()` applies none of its defaults and reports nothing without them). `ae-forgotten-export` — a type a public export names without exporting it — is recorded in the report, so a new one shows up as a report diff. On a component entry one of those names `__VLS_export`: that is vue-tsc's own symbol for the SFC's default export, not something to export.

The published surface supports TypeScript 5.7+ (`typescript` peer `>=5.7`). `abuddy-cli/tests/build/published-ui-types.spec.ts` compiles consumers against the packed package with both compilers (`packages/typescript-floor`).

## Build (`npm run build:package`, part of root `packages:build`)

The repo's `scripts/build-ui-package.ts` (it lives there, not here, so this package's own `scripts/` imports nothing above its layer):

1. Fails on missing entries or a stale exports map.
2. tsdown (`tsdown.config.ts`) compiles `computeEntries()` to `dist/` as ESM, `platform: 'neutral'`, with source maps. Shared modules become chunks. `unplugin-vue` compiles the SFCs. `dependencies` and `peerDependencies` are never bundled (`deps.neverBundle`, `onlyBundle: []`), so importing an undeclared package fails the build.
3. CSS: `css.inject` makes each compiled component import its own CSS. The postcss transformer inlines relative `@import`s (the tiptap theme). **Tailwind does not run here**: utility classes in templates stay class names, and the consumer's Tailwind generates them (see Styling).
4. `vue-tsc -p tsconfig.package.json` type-checks and emits declarations. `X.vue.d.ts` files are renamed to `X.d.vue.ts`, the name TypeScript looks for under node16/nodenext.
5. `BareImports.assertDeclared` (`scripts/lib/published-imports.ts`) checks that every bare import in `dist/**/*.js` is declared in `package.json`, and `assertExportTargetsBuilt` that every export target exists.

`dist/` checks live in `abuddy-cli/tests/build/`: `published-ui-dist` (no SFC source shipped, no relative CSS `@import` left, shared modules emitted once), `published-exports`, `published-specifiers`, `ui-exports`, `ui-import-side-effects`. They skip without `dist/` locally and fail when `dist` is older than `src`.

`package.json` is the published manifest (`files: ["dist"]`). Monorepo tooling resolves `src/` through the `@abuddy/source` condition (`tsconfig.json` `customConditions`, the renderer's Vite `resolve.conditions`).

## How packs get it at runtime

- **Host copy (default).** `getUiFeModules()` (`@abuddy/host/build/shared-deps`) lists every key of this package's exports map. The renderer's `hostDepsPlugin` (`packages/renderer/vite.config.ts`) imports each module and puts it on `window.__abuddy` under its full specifier (`window.__abuddy['@abuddy/ui/design/button']`). The pack FE bundler (`abuddy-cli/src/build/fe-bundler.ts`, `packExternalsPlugin`) replaces a pack's `@abuddy/ui/*` imports with proxy modules that read that global. A proxy throws if the host lacks the module and warns once for each export an older host lacks. Stateful modules therefore have one instance app-wide: `monaco-config.ts` (registered DSL libs, initialized languages), `editor-system.ts` (`setEditorSystem`, called by `TiptapEditor.vue`). Specs: `fe-bundler-shared-ui`, `fe-bundler-proxy-exports`.
- **`fe.bundleUi: true`** in `abuddy.json` bundles all of `@abuddy/ui` into the pack's `fe.js`, so a pack never mixes its own copy with the host's. The pack's Tailwind build then also scans `@abuddy/ui` (its `src/` when linked to a checkout, else `dist/**/*.js`). Fixture: `tests/fixtures/bundled-ui-pack`.
- **Consequences for this package:**
  - The app imports every public module at startup, so a module must do nothing when imported: no top-level listeners or registrations (`ui-import-side-effects.spec.ts`). Declarations are fine, including objects built from calls.
  - Removing or renaming an export breaks packs built against it on newer hosts. The `etc/` reports make such changes visible in review.

## What stays in `@abuddy/sdk/fe`

Contracts and host-shared state that packs need even without `@abuddy/ui` live in the SDK (`packages/abuddy-sdk/src/fe/`) and are shared through `SDK_FE_MODULES`. UI code imports them from `@abuddy/sdk/fe` and does not define its own copies:

- `useActorSystem` (`TiptapEditor.vue`, `KeyboardShortcutInput.vue`)
- menu state: `onMenuOpenChange` (`TrackedContextMenuRoot.vue`), `useTrackedMenuOpen` (`ContextMenuPopup.vue`, `composables/useContextMenu.ts`)
- lookups of what pack frontends registered, which read the renderer's bound registry (`bindFeHost({ packs })`): `tiptapPluginRegistry` (`TiptapEditor.vue`) and `getDslTypes` (`monaco-config.ts`; packs' frontend registrations carry them as `dslTypes`); and `EXTRA_BLOCK_ITEMS_KEY` (`TiptapBlockMenu.vue`)
- `openInAppBrowser` (`tiptap/composables/createEditorClickHandler.ts`)

UI modules also read `stepRegistry` from `@abuddy/sdk/steps` (`node-styles.ts`, `node-dimensions.ts`) and types from `@abuddy/sdk/steps` (`TNodeListItem.vue`) and `@abuddy/sdk/types` (`KeyboardShortcutInput.vue`). The dependency goes one way only: `@abuddy/sdk` must not import `@abuddy/ui`, and the SDK's `package.json` doesn't declare it. `@abuddy/sdk` is a peer (`>=0.1.0 <1.0.0`; the range has to span the 0.x line — Changesets majors a peer dependent whose range excludes the version its peer moves to, and the fixed release group carries that major to all five packages, so `~0.1.0` or `^0.1.0` would turn the next minor into a 1.0.0 release: `abuddy-cli/tests/build/release-plan.spec.ts`), as are `vue`, `xstate`, `@xstate/vue`, `reka-ui`, `lucide-vue-next`, `@vue-flow/core`, the tiptap core packages, `monaco-editor` and `elkjs`. Tiptap extensions, `highlight.js`, `lowlight`, `tiptap-markdown` and `@guolao/vue-monaco-editor` are regular dependencies.

## Component conventions (as used in `src/`)

- **SFC shape**: `<script setup lang="ts">` with type-only `defineProps<{...}>()` (`withDefaults` where defaults are needed) and typed `defineEmits<{...}>()`, in call-signature form (`(e: 'click', event: Event): void`) or tuple form (`save: [...]`). A component that needs module-level exports adds a plain `<script lang="ts">` block: `ColorPicker.vue` exports `DEFAULT_COLORS`, `BaseNode.vue` sets `name` and re-exports `HandleConfig`. Those exports reach consumers through the entry's `export *`.
- **v-model** uses a `modelValue` prop plus an `update:modelValue` emit. `defineModel` isn't used.
- **Class passthrough**: some components take a `class?: string` prop and merge it (`button.vue`: `[baseClasses, variantClasses, props.class]`). `dialog.vue` has `contentClass`.
- **Variants** are a string-union prop mapped to class strings in a `computed` (`button.vue` `variant`: `primary | secondary | transparent | ghost | danger`, plus disabled styles).
- **Primitives**: dialogs, menus and popovers wrap `reka-ui` (`dialog.vue`, `ConfirmationDialog.vue`, `TrackedContextMenuRoot.vue`, `tag-input.vue`, `ImageLightbox.vue`, `JsonHoverPopup.vue`). Icons come from `lucide-vue-next`.
- **Relative imports** name the file with its extension (`./editor-system.ts`, `./node-handles.ts`, `./button.vue`). `tsconfig.json` sets `allowImportingTsExtensions`, and `npm run check:specifiers` rejects relative `.js` specifiers.
- **Naming** (observed, not enforced):
  - Most SFCs are PascalCase (`CopyButton.vue`, `TiptapEditor.vue`). A few older primitives are kebab/lowercase (`button.vue`, `dialog.vue`, `tag-input.vue`, `panel-resizer.vue`); keep existing names, since they are export paths.
  - Non-component modules are kebab-case (`node-styles.ts`, `monaco-config.ts`). Composables are `useX.ts` (`createX.ts` for factories in `tiptap/composables`).
  - Emit names mix kebab-case (`toggle-link`, `clear-filters`) and camelCase (`imageClick`, `focusTitle`).

## Styling

- Tailwind utility classes in templates, on the app's dark theme with no `dark:` variants: mostly `neutral-*` (a few `gray-*`) for surfaces, text and borders, and the app's `primary-400…700` scale for accents.
- The app's Tailwind config (`packages/renderer/tailwind.config.ts`) scans `abuddy-ui/src/**` and defines `primary`. A class used only here is generated by the host build, and a pack with `fe.bundleUi` generates it itself. `primary-*` exists only where the Tailwind config defines it.
- Component-specific CSS goes in `<style scoped>` as plain CSS (no `@apply`), as in `dialog.vue` (`.dialog-overlay`, `.dialog-content`). Unscoped `<style>` is kept for styles that must reach rendered or third-party DOM (`TiptapEditor.vue` `@import "./tiptap-theme.css"`, `UnifiedMonacoEditor.vue`, `ColorPicker.vue`, `JsonViewerDialog.vue`); those rules are namespaced by a class the component owns (`.tiptap-wrapper .ProseMirror`), so a second copy of this package inside a `fe.bundleUi` pack restyles nothing outside it. **No module here imports a stylesheet from another package**: those are global, and this package ships inside every such pack, so the app imports them itself (`highlight.js/styles/github-dark.css`, in `packages/renderer/src/main.ts`). `ui-import-side-effects.spec.ts` fails one that comes back.
- These styles ship as CSS files that the compiled component imports. Consumers' bundlers collect them.

## Checks

```bash
npm run typecheck:ui                  # vue-tsc --noEmit (src, scripts, tsdown config)
npm run check:ui-entries              # exports map + component entries
npm run api:check -w @abuddy/ui       # etc/ reports current
npm run packages:build && npm run packages:check   # dist, publint, attw (esm-only)
npm test -w @abuddy/cli               # the published-ui / ui-* / fe-bundler-*ui specs
```
