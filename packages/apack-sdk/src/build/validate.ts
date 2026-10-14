import { findSourceModule, SCRIPT_MODULE_EXTENSIONS, TYPE_MODULE_EXTENSIONS } from './source-module.ts';
import { _parseModuleReference } from '../framework/module-reference.ts';
import { _packEntities } from '../framework/data-declaration.ts';
import { resolveTypeModule } from './type-module.ts';
import { _referenceTargets } from '../framework/reference-declaration.ts';
import { _pluginTargets } from '../framework/plugin-declaration.ts';
import * as fs from 'node:fs';
import { ManifestSchema } from './manifest-schema.ts';
import { packFeatures, type PackManifest } from './manifest.ts';
import { packValidation, type PackDiagnostic, type PackValidation } from './diagnostics.ts';

export function parseManifest(raw: unknown): PackValidation {
  const result = ManifestSchema.safeParse(raw);
  if (result.success) return packValidation();
  const packId = raw && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string' ? raw.id : undefined;

  const diagnostics: PackDiagnostic[] = result.error.issues.map(issue => {
    const fieldPath = issue.path.length > 0 ? `"${issue.path.join('.')}"` : 'root';
    return {
      code: `manifest.${issue.code}`, severity: 'error', packId, path: issue.path,
      message: `apack.json ${fieldPath}: ${issue.message}`,
    };
  });
  return packValidation(diagnostics);
}

export function validateManifest(manifestPath: string): PackValidation {
  if (!fs.existsSync(manifestPath)) {
    return packValidation([{ code: 'manifest.missing', severity: 'error', path: [], message: 'Missing apack.json manifest' }]);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return packValidation([{ code: 'manifest.json', severity: 'error', path: [], message: 'apack.json is not valid JSON' }]);
  }

  return parseManifest(raw);
}

/**
 * Checks a manifest's features against the pack on disk: each feature's `settings.form`, `system.entry`
 * and plugin state/component targets exist, pack settings forms exist, and no two features claim the same designation.
 *
 * A designation is a role, not a name, so it need not match the feature id: the registries map the role
 * to the id of the system (`pack-registration.ts` `designationsOf`) or plugin (`fe/pack-store.ts`) that
 * plays it. Within one pack nothing else catches a role claimed twice — `designationsOf` builds an
 * object, so the last one would silently win — which is what the check below is for. Across packs
 * `registerPack` throws.
 */
export function validateFeatures(packRoot: string, manifest: Pick<PackManifest, 'features'> & Partial<Pick<PackManifest, 'id' | 'extensions' | 'data'>>): PackValidation {
  const diagnostics: PackDiagnostic[] = [];
  const designatedBy = new Map<string, string>();
  for (const feature of packFeatures(manifest)) {
    const files: [string, string | undefined][] = [
      ['settings.form', feature.settings?.form],
      ...(feature.references ? _referenceTargets(feature.references).map(([field, target]): [string, string] => [`references.${field}`, target]) : []),
      ['system.entry', feature.system?.entry],
      ['system.contract', feature.system?.contract],
      ['plugin.contract', feature.plugin?.contract],
      ...Object.entries(feature.services ?? {}).map(([name, target]): [string, string] => [`services.${name}`, target]),
      ...Object.entries(feature.repositories ?? {}).map(([name, target]): [string, string] => [`repositories.${name}`, target]),
      ...(feature.plugin ? _pluginTargets(feature.plugin).map(([field, target]): [string, string] => [`plugin.${field}`, target]) : []),
    ];
    for (const [field, target] of files) {
      if (target === undefined) continue;
      const address = ['features', feature.id, ...field.split('.')];
      const label = `Feature "${feature.id}": ${field}`;
      try {
        const { source } = _parseModuleReference(target, label, 'default');
        if (!findSourceModule(packRoot, source, [...SCRIPT_MODULE_EXTENSIONS, '.vue'], label)) {
          diagnostics.push({ code: 'feature.missing-file', severity: 'error', packId: manifest.id,
            path: address, source,
            message: `${label} file "${source}" not found` });
        }
      } catch (error) {
        diagnostics.push({ code: 'feature.invalid-target', severity: 'error', packId: manifest.id,
          path: address, source: target, message: error instanceof Error ? error.message : String(error) });
      }
    }
    if (feature.types !== undefined) {
      try { resolveTypeModule(packRoot, feature.types, `Feature "${feature.id}": types`); }
      catch (error) {
        diagnostics.push({ code: 'feature.type-module', severity: 'error', packId: manifest.id,
          path: ['features', feature.id, 'types'], source: feature.types,
          message: error instanceof Error ? error.message : String(error) });
      }
    }
    if (feature.designation !== undefined) {
      const held = designatedBy.get(feature.designation);
      if (held !== undefined) {
        diagnostics.push({
          code: 'feature.designation-conflict', severity: 'error', packId: manifest.id,
          path: ['features', feature.id, 'designation'],
          message: `Feature "${feature.id}": designation "${feature.designation}" is already claimed by feature "${held}"`,
        });
      } else {
        designatedBy.set(feature.designation, feature.id);
      }
    }
  }
  for (const [groupId, definition] of Object.entries(manifest.extensions?.settings ?? {})) {
    const target = definition.form;
    if (target === undefined) continue;
    const label = `Settings group "${groupId}": form`;
    try {
      const { source } = _parseModuleReference(target, label, 'default');
      if (!findSourceModule(packRoot, source, [...SCRIPT_MODULE_EXTENSIONS, '.vue'], label)) {
        diagnostics.push({ code: 'settings.missing-form', severity: 'error', packId: manifest.id,
          path: ['extensions', 'settings', groupId, 'form'], source,
          message: `${label} file "${source}" not found` });
      }
    } catch (error) {
      diagnostics.push({ code: 'settings.invalid-form', severity: 'error', packId: manifest.id,
        path: ['extensions', 'settings', groupId, 'form'], source: target,
        message: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const { name, owner, shape } of _packEntities(manifest)) {
    if (shape === null) continue;
    const label = `Entity shape "${name}"`;
    const address = [...owner.split('.'), 'entities', name];
    try {
      const { source } = _parseModuleReference(shape, label);
      if (!findSourceModule(packRoot, source, TYPE_MODULE_EXTENSIONS, label)) {
        diagnostics.push({ code: 'entity.missing-shape-module', severity: 'error', packId: manifest.id,
          path: address, source, message: `${label}: no module found at ${source}` });
      }
    } catch (error) {
      diagnostics.push({ code: 'entity.invalid-shape-target', severity: 'error', packId: manifest.id,
        path: address, source: shape, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return packValidation(diagnostics);
}
