import * as fs from 'node:fs';
import * as path from 'node:path';
import { ManifestSchema } from './manifest-schema.ts';
import type { PackManifest } from './manifest.ts';

export interface ManifestValidation {
  errors: string[];
  warnings: string[];
}

export function parseManifest(raw: unknown): ManifestValidation {
  const result = ManifestSchema.safeParse(raw);
  if (result.success) return { errors: [], warnings: [] };

  const errors = result.error.issues.map(issue => {
    const fieldPath = issue.path.length > 0 ? `"${issue.path.join('.')}"` : 'root';
    return `abuddy.json ${fieldPath}: ${issue.message}`;
  });
  return { errors, warnings: [] };
}

export function validateManifest(manifestPath: string): ManifestValidation {
  if (!fs.existsSync(manifestPath)) {
    return { errors: ['Missing abuddy.json manifest'], warnings: [] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return { errors: ['abuddy.json is not valid JSON'], warnings: [] };
  }

  return parseManifest(raw);
}

/**
 * Checks a manifest's `features[]` against the pack on disk: each feature's `settings`, `system.entry`
 * and `plugin.entry` file exists, and no two features claim the same designation.
 *
 * A designation is a role, not a name, so it need not match the feature id: the registries map the role
 * to the id of the system (`pack-registration.ts` `designationsOf`) or plugin (`fe/pack-store.ts`) that
 * plays it. Within one pack nothing else catches a role claimed twice — `designationsOf` builds an
 * object, so the last one would silently win — which is what the check below is for. Across packs
 * `registerPack` throws.
 */
export function validateFeatures(packRoot: string, manifest: Pick<PackManifest, 'features'>): ManifestValidation {
  const errors: string[] = [];
  const designatedBy = new Map<string, string>();
  for (const feature of manifest.features ?? []) {
    const files: [string, string | undefined][] = [
      ['settings', feature.settings],
      ['system.entry', feature.system?.entry],
      ['plugin.entry', feature.plugin?.entry],
      // Written without its extension, as codegen reads it. A typo here costs the feature its types in
      // `#generated/types` and says nothing, which is worth a word at validate time
      ['typesEntry', feature.typesEntry?.endsWith('.ts') === false ? `${feature.typesEntry}.ts` : feature.typesEntry],
    ];
    for (const [field, file] of files) {
      if (file !== undefined && !fs.existsSync(path.resolve(packRoot, file))) {
        errors.push(`Feature "${feature.id}": ${field} file "${file}" not found`);
      }
    }
    if (feature.designation !== undefined) {
      const held = designatedBy.get(feature.designation);
      if (held !== undefined) {
        errors.push(`Feature "${feature.id}": designation "${feature.designation}" is already claimed by feature "${held}"`);
      } else {
        designatedBy.set(feature.designation, feature.id);
      }
    }
  }
  return { errors, warnings: [] };
}
