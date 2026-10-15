import { _packEntityTypes, _packRelationTypes } from '@apackdev/sdk/framework';
import { lifecycleBindingProblem } from './lifecycle-binding.ts';
import type { PackManifest } from '@apackdev/sdk/build';
import { isPlainObject } from '@apackdev/sdk/utils/pure';
import { namedBindings, sameKeys, sameNames } from './binding-shape.ts';
import { isDeepStrictEqual } from 'node:util';

/** Content bindings provide data operations, independently of backend activation. */
export function contentBindingProblem(manifest: PackManifest, runtime: unknown, appliers?: unknown): string | undefined {
  const problem = (path: string) => `Pack "${manifest.id}" content runtime ${path} does not match its accepted declarations`;
  if (!isPlainObject(runtime)) return problem('registration');
  if (!isDeepStrictEqual(runtime.entities, _packEntityTypes(manifest))) return problem('entities');
  if (!isDeepStrictEqual(runtime.relKinds, _packRelationTypes(manifest))) return problem('relKinds');
  const repositories = Object.values(manifest.features ?? {}).flatMap(feature => Object.keys(feature.repositories ?? {}));
  if (!sameKeys(runtime.repositories, repositories)) return problem('repositories');
  if (!sameKeys(runtime.contentWriters, Object.keys(manifest.content?.writers ?? {}))) return problem('contentWriters');
  if (appliers !== undefined) {
    const declared = Object.keys(manifest.content?.sources ?? {});
    if (!Array.isArray(appliers) || appliers.some(applier => !applier || typeof applier !== 'object' || Array.isArray(applier)
      || typeof applier.key !== 'string' || !declared.includes(applier.key))) return problem('appliers');
    if (new Set(appliers.map(applier => applier.key)).size !== appliers.length) return problem('appliers');
  }
}

/** Check contributed identities before any runtime object enters the registry. */
export function backendBindingProblem(manifest: PackManifest, registration: unknown): string | undefined {
  const problem = (path: string) => `Pack "${manifest.id}" runtime ${path} does not match its accepted declarations`;
  if (!isPlainObject(registration)) return problem('registration');
  const declared = manifest.features ?? {};
  const features = registration.features === undefined ? {} : registration.features;
  if (!sameKeys(features, Object.keys(declared))) return problem('features');
  if (!isPlainObject(features)) return problem('features');
  for (const [id, declaration] of Object.entries(declared)) {
    const feature = features[id];
    if (!isPlainObject(feature)) return problem(`features.${id}`);
    if (feature.designation !== declaration.designation) return problem(`features.${id}.designation`);
    for (const kind of ['system', 'plugin'] as const) {
      if ((feature[kind] !== undefined) !== (declaration[kind] !== undefined)) return problem(`features.${id}.${kind}`);
      if (declaration[kind] && !isPlainObject(feature[kind])) return problem(`features.${id}.${kind}`);
    }
    if (declaration.plugin && (feature.plugin as Record<string, unknown>).defaultVisible !== declaration.plugin.defaultVisible) {
      return problem(`features.${id}.plugin.defaultVisible`);
    }
    if (!sameNames(feature.services === undefined ? [] : feature.services, Object.keys(declaration.services ?? {}))) return problem(`features.${id}.services`);
  }
  const services = [...Object.keys(manifest.extensions?.services ?? {}),
    ...Object.values(declared).flatMap(feature => Object.keys(feature.services ?? {}))];
  if (!sameKeys(registration.services === undefined ? {} : registration.services, services)) return problem('services');
  const repositories = Object.values(declared).flatMap(feature => Object.keys(feature.repositories ?? {}));
  if (!sameKeys(registration.repositories === undefined ? {} : registration.repositories, repositories)) return problem('repositories');

  const ears = registration.ears === undefined ? {} : registration.ears;
  if (!isPlainObject(ears)) return problem('ears');
  if (!isDeepStrictEqual(ears.entities === undefined ? {} : ears.entities, _packEntityTypes(manifest))) return problem('ears.entities');
  if (!isDeepStrictEqual(ears.relKinds === undefined ? {} : ears.relKinds, _packRelationTypes(manifest))) return problem('ears.relKinds');
  if (!sameKeys(registration.contentWriters === undefined ? {} : registration.contentWriters,
    Object.keys(manifest.content?.writers ?? {}))) return problem('contentWriters');
  if (!namedBindings(registration.appliers, 'key', Object.keys(manifest.content?.sources ?? {}))) return problem('appliers');

  const commands = namedBindings(registration.commands, 'name', Object.keys(manifest.extensions?.commands ?? {}));
  if (!commands) return problem('commands');
  for (const [name, declaration] of Object.entries(manifest.extensions?.commands ?? {})) {
    if (commands.get(name)!.placeholder !== declaration.placeholder) return problem(`commands.${name}.placeholder`);
  }

  const artifacts = namedBindings(registration.artifacts, 'type', Object.keys(manifest.extensions?.artifacts ?? {}));
  if (!artifacts) return problem('artifacts');
  for (const [type, artifact] of artifacts) if (artifact.fe !== undefined) return problem(`artifacts.${type}.fe`);

  const blocks = namedBindings(registration.blocks, 'type', Object.keys(manifest.extensions?.blocks ?? {}));
  if (!blocks) return problem('blocks');
  for (const [type, declaration] of Object.entries(manifest.extensions?.blocks ?? {})) {
    const block = blocks.get(type)!;
    if ((block.kind === undefined ? 'display' : block.kind) !== (declaration.kind ?? 'display')) return problem(`blocks.${type}.kind`);
    if (block.fe !== undefined) return problem(`blocks.${type}.fe`);
    if ((block.be !== undefined) !== (declaration.be !== undefined)) return problem(`blocks.${type}.be`);
    if (block.be !== undefined && (!block.be || typeof block.be !== 'object' || Array.isArray(block.be))) return problem(`blocks.${type}.be`);
  }

  const steps = namedBindings(registration.steps, 'type', Object.keys(manifest.extensions?.steps ?? {}));
  if (!steps) return problem('steps');
  for (const [type, declaration] of Object.entries(manifest.extensions?.steps ?? {})) {
    const step = steps.get(type)!;
    if ((step.kind === undefined ? 'step' : step.kind) !== (declaration.kind ?? 'step')) return problem(`steps.${type}.kind`);
    if (step.fe !== undefined) return problem(`steps.${type}.fe`);
    if (!isDeepStrictEqual(step.node, declaration.node)) return problem(`steps.${type}.node`);
    for (const facet of ['build', 'trigger'] as const) {
      if ((step[facet] !== undefined) !== (declaration[facet] !== undefined)) return problem(`steps.${type}.${facet}`);
      if (step[facet] !== undefined && (!step[facet] || typeof step[facet] !== 'object' || Array.isArray(step[facet]))) return problem(`steps.${type}.${facet}`);
    }
    const runtime = declaration.runtime;
    const hasRuntime = Boolean(runtime?.handler || runtime?.isAsync || runtime?.waits || runtime?.spawnsSubflow);
    if ((step.runtime !== undefined) !== hasRuntime) return problem(`steps.${type}.runtime`);
    if (hasRuntime) {
      if (!isPlainObject(step.runtime)) return problem(`steps.${type}.runtime`);
      if ((step.runtime.handler !== undefined) !== (runtime?.handler !== undefined)
        || (step.runtime.handler !== undefined && typeof step.runtime.handler !== 'function')) return problem(`steps.${type}.runtime.handler`);
      for (const flag of ['isAsync', 'waits', 'spawnsSubflow'] as const) {
        if ((step.runtime[flag] === undefined ? false : step.runtime[flag]) !== (runtime?.[flag] ?? false)) return problem(`steps.${type}.runtime.${flag}`);
      }
    }
  }

  const migrations = registration.migrations === undefined ? {} : registration.migrations;
  if (!isPlainObject(migrations) || Object.keys(migrations).some(line => line !== 'app' && line !== 'pack')) return problem('migrations');
  for (const line of ['app', 'pack'] as const) {
    const entries = namedBindings(migrations[line], 'target', Object.keys(manifest.migrations?.[line] ?? {}));
    if (!entries) return problem(`migrations.${line}`);
    for (const [target, entry] of entries) {
      if (typeof entry.up !== 'function' || entry.description !== manifest.migrations![line]![target].description) return problem(`migrations.${line}.${target}`);
    }
  }
  const lifecycleProblem = lifecycleBindingProblem(manifest.lifecycle, registration.lifecycle);
  if (lifecycleProblem) return problem(lifecycleProblem);
}
