import type { PackManifest } from '@apackdev/sdk/build';
import type { PluginDeclaration, SettingsDefinition, ReferenceDeclarations } from '@apackdev/sdk/framework';
import type { PackFERegistration, PackFEFeature, PluginDefinition } from '@apackdev/sdk/fe';
import { isPlainObject, hasOwn } from '@apackdev/sdk/utils/pure';
import { namedBindings, sameKeys } from '../packs/binding-shape.ts';

const REGISTRATION_KEYS = {
  id: true, declarationRevision: true, bindSettings: true, features: true, settingsForms: true,
  steps: true, artifacts: true, blocks: true, appExtensions: true, dslTypes: true, tiptapPlugins: true,
} satisfies Record<keyof PackFERegistration, true>;

const FEATURE_KEYS = { plugin: true, settingsForm: true, designation: true, default: true, references: true } satisfies Record<keyof PackFEFeature, true>;
const PLUGIN_KEYS = { label: true, state: true, icon: true, canvas: true, panel: true, chat: true,
  isPinned: true, hotkeys: true, options: true, fallbackPanel: true } satisfies Record<keyof PluginDefinition, true>;
const optionalKeys = (actual: unknown, keys: string[]) => sameKeys(actual === undefined ? {} : actual, keys);
const isComponent = (value: unknown) => typeof value === 'function' || isPlainObject(value);

/** Compare a bound plugin to its data without executing its views or predicates. */
function pluginBindingProblem(declaration: PluginDeclaration, plugin: unknown): string | undefined {
  const problem = (field = '') => `plugin${field ? '.' + field : ''}`;
  if (!isPlainObject(plugin) || typeof plugin.label !== 'string' || !plugin.label.trim()
    || !isPlainObject(plugin.state) || typeof plugin.state.transition !== 'function'
    || typeof plugin.state.getInitialSnapshot !== 'function') return problem();
  for (const key of Object.keys(plugin)) if (!hasOwn(PLUGIN_KEYS, key)) return problem(key);
  for (const field of ['label', 'isPinned'] as const) if (plugin[field] !== declaration[field]) return problem(field);
  for (const field of ['icon', 'panel', 'chat'] as const) {
    if ((plugin[field] !== undefined) !== (declaration[field] !== undefined)
      || (declaration[field] !== undefined && !isComponent(plugin[field]))) return problem(field);
  }
  if ((plugin.canvas !== undefined) !== (declaration.canvas !== undefined)) return problem('canvas');
  if (declaration.canvas !== undefined) {
    const canvas = declaration.canvas;
    if (typeof canvas === 'object' && 'routes' in canvas) {
      if (!sameKeys(plugin.canvas, Object.keys(canvas.routes)) || Object.values(plugin.canvas as Record<string, unknown>).some(value => !isComponent(value))) return problem('canvas.routes');
    } else if (!isComponent(plugin.canvas)) return problem('canvas');
  }
  if (declaration.hotkeys === undefined ? plugin.hotkeys !== undefined : !Array.isArray(plugin.hotkeys)
    || plugin.hotkeys.length !== declaration.hotkeys.length || declaration.hotkeys.some((hotkey, index) => {
      const actual = (plugin.hotkeys as unknown[])[index];
      return !sameKeys(actual, Object.keys(hotkey)) || (actual as Record<string, unknown>).action !== hotkey.action
        || (actual as Record<string, unknown>).global !== hotkey.global;
    })) return problem('hotkeys');
  if (declaration.options === undefined ? plugin.options !== undefined : !sameKeys(plugin.options, Object.keys(declaration.options))
    || (plugin.options as Record<string, unknown>).headerClass !== declaration.options.headerClass) return problem('options');
  const fallback = plugin.fallbackPanel;
  if (declaration.fallbackPanel === undefined ? fallback !== undefined : !isPlainObject(fallback)
    || !sameKeys(fallback, ['label', 'toggle', 'isShown']) || fallback.label !== declaration.fallbackPanel.label
    || !sameKeys(fallback.toggle, ['type']) || (fallback.toggle as Record<string, unknown>).type !== declaration.fallbackPanel.toggle.type
    || typeof fallback.isShown !== 'function') return problem('fallbackPanel');
}

/** Validate the complete reference facet without calling navigation, providers or components. */
function referenceBindingProblem(declaration: ReferenceDeclarations, actual: unknown): string | undefined {
  if (!sameKeys(actual, ['types', 'categories'])) return 'references';
  const bindings = actual as Record<string, unknown>;
  if (!sameKeys(bindings.types, Object.keys(declaration.types))) return 'references.types';
  if (!sameKeys(bindings.categories, Object.keys(declaration.categories))) return 'references.categories';
  for (const [id, expected] of Object.entries(declaration.types)) {
    const value = (bindings.types as Record<string, unknown>)[id];
    const path = `references.types.${id}`;
    if (!sameKeys(value, ['category', 'icon', 'svgElements', 'navigate'])) return path;
    const type = value as Record<string, unknown>;
    if (type.category !== expected.category
      || !isComponent(type.icon) || typeof type.navigate !== 'function') return path;
    if (!Array.isArray(type.svgElements) || type.svgElements.length !== expected.svgElements.length) return `${path}.svgElements`;
    for (const [index, [tag, attrs]] of expected.svgElements.entries()) {
      const element = type.svgElements[index];
      if (!Array.isArray(element) || element.length !== 2 || element[0] !== tag
        || !sameKeys(element[1], Object.keys(attrs)) || Object.entries(attrs).some(([key, value]) => element[1][key] !== value)) return `${path}.svgElements`;
    }
  }
  for (const [id, expected] of Object.entries(declaration.categories)) {
    const value = (bindings.categories as Record<string, unknown>)[id];
    if (!sameKeys(value, ['label', 'icon', 'useItems'])) return `references.categories.${id}`;
    const category = value as Record<string, unknown>;
    if (category.label !== expected.label || !isComponent(category.icon)
      || typeof category.useItems !== 'function') return `references.categories.${id}`;
  }
}

/** Check declared identities before registering components, resolving factories or granting settings access. */
export function frontendBindingProblem(manifest: Pick<PackManifest, 'id' | 'extensions'> & {
  features?: Record<string, { plugin?: PluginDeclaration; designation?: string; settings?: SettingsDefinition; references?: ReferenceDeclarations }>;
}, registration: unknown): string | undefined {
  const problem = (path: string) => `Pack "${manifest.id}" frontend ${path} does not match its accepted declarations`;
  if (!isPlainObject(registration)) return problem('registration');
  if (Object.keys(registration).some(key => !hasOwn(REGISTRATION_KEYS, key))) return problem('registration fields');
  if (registration.bindSettings !== undefined && typeof registration.bindSettings !== 'function') return problem('bindSettings');
  const declared = Object.fromEntries(Object.entries(manifest.features ?? {}).filter(([, feature]) =>
    feature.plugin || feature.designation || feature.settings?.form || feature.references));
  const features = registration.features === undefined ? {} : registration.features;
  if (!sameKeys(features, Object.keys(declared))) return problem('features');
  for (const [id, feature] of Object.entries(features as Record<string, unknown>)) {
    const expected = declared[id];
    if (!isPlainObject(feature) || Object.keys(feature).some(key => !hasOwn(FEATURE_KEYS, key))) return problem(`features.${id}`);
    if ((feature.references !== undefined) !== !!expected.references) return problem(`features.${id}.references`);
    if (expected.references) {
      const mismatch = referenceBindingProblem(expected.references, feature.references);
      if (mismatch) return problem(`features.${id}.${mismatch}`);
    }
    if (feature.designation !== expected.designation) return problem(`features.${id}.designation`);
    if (feature.default !== (expected.plugin?.default ? true : undefined)) return problem(`features.${id}.default`);
    if ((feature.plugin !== undefined) !== !!expected.plugin) return problem(`features.${id}.plugin`);
    if (expected.plugin) {
      const mismatch = pluginBindingProblem(expected.plugin, feature.plugin);
      if (mismatch) return problem(`features.${id}.${mismatch}`);
    }
    if ((feature.settingsForm !== undefined) !== !!expected.settings?.form || (expected.settings?.form && !isComponent(feature.settingsForm))) return problem(`features.${id}.settingsForm`);
  }
  const groups = Object.entries(manifest.extensions?.settings ?? {}).filter(([, definition]) => definition.form).map(([id]) => id);
  if (!optionalKeys(registration.settingsForms, groups)) return problem('settingsForms');
  if (registration.settingsForms !== undefined && Object.values(registration.settingsForms as Record<string, unknown>).some(form => !isComponent(form))) return problem('settingsForms');
  const extensions = manifest.extensions;
  const stepDeclarations = Object.entries(extensions?.steps ?? {});
  const steps = namedBindings(registration.steps, 'type', stepDeclarations.map(([type]) => type));
  if (!steps) return problem('steps');
  for (const [type, entry] of stepDeclarations) {
    const step = steps.get(type)!;
    if ((step.kind ?? 'step') !== (entry.kind ?? 'step')) return problem(`steps.${type}.kind`);
    for (const facet of ['node', 'fe'] as const) {
      if ((step[facet] !== undefined) !== !!entry[facet] || (entry[facet] && !isPlainObject(step[facet]))) return problem(`steps.${type}.${facet}`);
    }
    for (const facet of ['build', 'runtime', 'trigger']) if (step[facet] !== undefined) return problem(`steps.${type}.${facet}`);
  }
  const artifacts = namedBindings(registration.artifacts, 'type', Object.keys(extensions?.artifacts ?? {}));
  if (!artifacts) return problem('artifacts');
  for (const [type, entry] of Object.entries(extensions?.artifacts ?? {})) {
    const facet = artifacts.get(type)!.fe;
    if (!isPlainObject(facet) || !isComponent(facet.icon) || (facet.component !== undefined) !== !!entry.fe || (entry.fe && !isComponent(facet.component))) return problem(`artifacts.${type}.fe`);
  }
  const blocks = namedBindings(registration.blocks, 'type', Object.keys(extensions?.blocks ?? {}));
  if (!blocks) return problem('blocks');
  for (const [type, entry] of Object.entries(extensions?.blocks ?? {})) {
    const block = blocks.get(type)!;
    if ((block.kind ?? 'display') !== (entry.kind ?? 'display')) return problem(`blocks.${type}.kind`);
    if ((block.fe !== undefined) !== !!entry.fe || (entry.fe && (!isPlainObject(block.fe) || !isComponent(block.fe.component)))) return problem(`blocks.${type}.fe`);
    if (block.be !== undefined) return problem(`blocks.${type}.be`);
  }
  if (!optionalKeys(registration.appExtensions, Object.keys(extensions?.fe?.appExtensions ?? {}))) return problem('appExtensions');
  if (registration.appExtensions !== undefined && Object.values(registration.appExtensions as Record<string, unknown>).some(component => !isComponent(component))) return problem('appExtensions');
  const dsl = Object.fromEntries(Object.entries(extensions?.dsl ?? {}).filter(([, entry]) => entry.targets.includes('monaco') && entry.globals));
  if (!optionalKeys(registration.dslTypes, Object.keys(dsl))) return problem('dslTypes');
  for (const [id, entry] of Object.entries(dsl)) {
    const binding = (registration.dslTypes as Record<string, unknown>)[id];
    if (!isPlainObject(binding) || binding.prefix !== (entry.prefix ?? '') || typeof binding.schema !== 'string'
      || !sameKeys(binding.globals, Object.keys(entry.globals!))) return problem(`dslTypes.${id}`);
    for (const [key, value] of Object.entries(entry.globals!)) {
      if ((binding.globals as Record<string, unknown>)[key] !== value) return problem(`dslTypes.${id}.globals.${key}`);
    }
  }
  const tiptap = registration.tiptapPlugins;
  if (extensions?.fe?.tiptapPlugins) {
    if (!Array.isArray(tiptap) || tiptap.some(binding => !isPlainObject(binding))) return problem('tiptapPlugins');
  } else if (tiptap !== undefined && (!Array.isArray(tiptap) || tiptap.length)) return problem('tiptapPlugins');
}
