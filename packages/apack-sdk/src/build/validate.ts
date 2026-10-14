import { _referenceTargets } from '../framework/reference-declaration.ts';
import { _pluginTargets } from '../framework/plugin-declaration.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { _MOVED_ROOT_KEYS, ManifestSchema } from './manifest-schema.ts';
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
      message: `apack.json ${fieldPath}: ${issue.message}${movedKeyHint(issue)}`,
    };
  });
  return packValidation(diagnostics);
}

/**
 * Where a key the manifest no longer has at its root lives now. `.strict()` reports an unrecognized key
 * and says nothing about where it went, which is the whole of what a reader needs — so the names are
 * appended to that one message rather than accepted anywhere.
 */
function movedKeyHint(issue: { code: string; keys?: string[] }): string {
  if (issue.code !== 'unrecognized_keys') return '';
  const moved = (issue.keys ?? []).flatMap((key) => {
    const to = _MOVED_ROOT_KEYS[key];
    return to ? [`"${key}" is now "${to}"`] : [];
  });
  return moved.length > 0 ? ` (${moved.join(', ')})` : '';
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
export function validateFeatures(packRoot: string, manifest: Pick<PackManifest, 'features'> & Partial<Pick<PackManifest, 'id' | 'extensions'>>): PackValidation {
  const diagnostics: PackDiagnostic[] = [];
  const designatedBy = new Map<string, string>();
  for (const feature of packFeatures(manifest)) {
    const files: [string, string | undefined][] = [
      ['settings.form', feature.settings?.form],
      ...(feature.references ? _referenceTargets(feature.references).map(([field, target]): [string, string] => [`references.${field}`, target.split('#')[0]!]) : []),
      ['system.entry', feature.system?.entry],
      ...(feature.plugin ? _pluginTargets(feature.plugin).map(([field, target]): [string, string] => [`plugin.${field}`, target.split('#')[0]!]) : []),
      // Written without its extension, as codegen reads it. A typo here costs the feature its types in
      // `#generated/types` and says nothing, which is worth a word at validate time
      ['typesEntry', feature.typesEntry?.endsWith('.ts') === false ? `${feature.typesEntry}.ts` : feature.typesEntry],
    ];
    for (const [field, file] of files) {
      if (file !== undefined && !fs.existsSync(path.resolve(packRoot, file))) {
        diagnostics.push({
          code: 'feature.missing-file', severity: 'error', packId: manifest.id,
          path: ['features', feature.id, ...field.split('.')], source: file,
          message: `Feature "${feature.id}": ${field} file "${file}" not found`,
        });
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
    const file = definition.form;
    if (file !== undefined && !fs.existsSync(path.resolve(packRoot, file))) {
      diagnostics.push({
        code: 'settings.missing-form', severity: 'error', packId: manifest.id,
        path: ['extensions', 'settings', groupId, 'form'], source: file,
        message: `Settings group "${groupId}": form file "${file}" not found`,
      });
    }
  }
  return packValidation(diagnostics);
}
