import type { PackManifest } from '@apackdev/sdk/build';
import { isPlainObject } from '@apackdev/sdk/utils/pure';
import { isDeepStrictEqual } from 'node:util';

/** Content bindings provide data operations, independently of backend activation. */
export function contentBindingProblem(manifest: PackManifest, runtime: unknown, appliers?: unknown): string | undefined {
  const problem = (path: string) => `Pack "${manifest.id}" content runtime ${path} does not match its accepted declarations`;
  if (!isPlainObject(runtime)) return problem('registration');
  if (!isDeepStrictEqual(runtime.entities, manifest.entities ?? {})) return problem('entities');
  if (!isDeepStrictEqual(runtime.relKinds, manifest.relKinds ?? {})) return problem('relKinds');
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
}

function sameNames(actual: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(actual) || actual.some(name => typeof name !== 'string')) return false;
  const names = new Set(actual);
  return names.size === actual.length && names.size === expected.length && expected.every(name => names.has(name));
}

function sameKeys(actual: unknown, expected: readonly string[]): boolean {
  return isPlainObject(actual) && sameNames(Object.keys(actual), expected);
}
