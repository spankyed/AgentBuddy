import { _packEntities } from '../framework/data-declaration.ts';
import { _pluginTargets } from '../framework/plugin-declaration.ts';
import { _referenceTargets } from '../framework/reference-declaration.ts';
import { packFeatures, type PackManifest } from './manifest.ts';
import { MIGRATION_LINES } from './manifest-schema.ts';

interface ModuleTarget {
  path: string[];
  target: string;
  kind: 'script' | 'component' | 'type' | 'types';
  named: boolean;
  label: string;
}

/** Authored module targets, derived from declarations; no source discovery or executable imports. */
export function _packModuleTargets(manifest: Partial<PackManifest>): ModuleTarget[] {
  const targets: ModuleTarget[] = [];
  const add = (path: string[], target: string | undefined, kind: ModuleTarget['kind'] = 'script', named = true, label = path.join('.')) => {
    if (target !== undefined) targets.push({ path, target, kind, named, label });
  };
  for (const feature of packFeatures(manifest)) {
    const prefix = ['features', feature.id];
    const field = (name: string, target: string | undefined, kind: ModuleTarget['kind'] = 'script', named = true) =>
      add([...prefix, ...name.split('.')], target, kind, named, `Feature "${feature.id}": ${name}`);
    field('settings.form', feature.settings?.form, 'component', false);
    for (const [name, target] of feature.references ? _referenceTargets(feature.references) : []) {
      const icon = name.endsWith('.icon');
      field(`references.${name}`, target, icon ? 'component' : 'script', !icon);
    }
    field('system.entry', feature.system?.entry, 'script', false);
    field('system.contract', feature.system?.contract, 'type');
    field('plugin.contract', feature.plugin?.contract, 'type');
    for (const [name, target] of Object.entries(feature.services ?? {})) field(`services.${name}`, target);
    for (const [name, target] of Object.entries(feature.repositories ?? {})) field(`repositories.${name}`, target);
    for (const [name, target] of feature.plugin ? _pluginTargets(feature.plugin) : []) {
      field(`plugin.${name}`, target, name === 'state' || name === 'fallbackPanel.isShown' ? 'script' : 'component', name === 'fallbackPanel.isShown');
    }
    field('types', feature.types, 'types', false);
  }
  for (const [name, definition] of Object.entries(manifest.extensions?.settings ?? {})) {
    add(['extensions', 'settings', name, 'form'], definition.form, 'component', false, `Settings group "${name}": form`);
  }
  for (const { name, owner, shape } of _packEntities(manifest)) {
    if (shape !== null) add([...owner.split('.'), 'entities', name], shape, 'type', true, `Entity shape "${name}"`);
  }
  for (const [name, target] of Object.entries(manifest.extensions?.services ?? {})) add(['extensions', 'services', name], target);
  for (const [name, entry] of Object.entries(manifest.extensions?.steps ?? {})) {
    const prefix = ['extensions', 'steps', name];
    for (const [field, target] of [
      ['node', entry.node], ['build', entry.build], ['trigger.facet', entry.trigger?.facet],
      ['trigger.register', entry.trigger?.register], ['runtime.handler', entry.runtime?.handler], ['fe', entry.fe],
    ] as const) add([...prefix, ...field.split('.')], target);
  }
  for (const [name, entry] of Object.entries(manifest.extensions?.blocks ?? {})) {
    add(['extensions', 'blocks', name, 'be'], entry.be);
    add(['extensions', 'blocks', name, 'fe'], entry.fe, 'component', false);
  }
  for (const [name, entry] of Object.entries(manifest.extensions?.artifacts ?? {})) add(['extensions', 'artifacts', name, 'fe'], entry.fe, 'component', false);
  for (const [name, entry] of Object.entries(manifest.extensions?.dsl ?? {})) add(['extensions', 'dsl', name, 'entry'], entry.entry, 'types', false);
  add(['extensions', 'fe', 'tiptapPlugins'], manifest.extensions?.fe?.tiptapPlugins, 'script', false);
  for (const [name, target] of Object.entries(manifest.extensions?.fe?.appExtensions ?? {})) add(['extensions', 'fe', 'appExtensions', name], target, 'component', false);
  for (const [name, target] of Object.entries(manifest.lifecycle ?? {})) add(['lifecycle', name], target);
  for (const line of MIGRATION_LINES) {
    for (const [version, entry] of Object.entries(manifest.migrations?.[line] ?? {})) add(['migrations', line, version, 'up'], entry.up);
  }
  for (const [name, target] of Object.entries(manifest.content?.writers ?? {})) add(['content', 'writers', name], target);
  for (const [name, entry] of Object.entries(manifest.content?.formats ?? {})) add(['content', 'formats', name, 'compiler'], entry.compiler, 'script', false);
  for (const [name, entry] of Object.entries(manifest.content?.sources ?? {})) {
    if (typeof entry !== 'string') add(['content', 'sources', name, 'applier'], entry.applier, 'script', false);
  }
  return targets;
}
