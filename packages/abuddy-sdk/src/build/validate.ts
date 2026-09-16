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
 * Checks a manifest's `features[]` against the pack on disk: each feature's `settings`, `system.entry` and
 * `plugin.entry` file exists, and a `designation` equals its feature id (the designation registry routes a
 * role to the feature of the same id).
 */
export function validateFeatures(packRoot: string, manifest: Pick<PackManifest, 'features'>): ManifestValidation {
  const errors: string[] = [];
  for (const feature of manifest.features ?? []) {
    const files: [string, string | undefined][] = [
      ['settings', feature.settings],
      ['system.entry', feature.system?.entry],
      ['plugin.entry', feature.plugin?.entry],
    ];
    for (const [field, file] of files) {
      if (file !== undefined && !fs.existsSync(path.resolve(packRoot, file))) {
        errors.push(`Feature "${feature.id}": ${field} file "${file}" not found`);
      }
    }
    if (feature.designation !== undefined && feature.designation !== feature.id) {
      errors.push(`Feature "${feature.id}": designation "${feature.designation}" must equal the feature id`);
    }
  }
  return { errors, warnings: [] };
}
