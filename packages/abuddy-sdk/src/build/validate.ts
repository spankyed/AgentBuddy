import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ManifestSchema } from './manifest-schema';
import type { FeatureConfig } from './types';

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

export async function validateFeatures(featuresDir: string): Promise<ManifestValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(featuresDir)) {
    warnings.push('No src/features/ directory found');
    return { errors, warnings };
  }

  const entries = fs.readdirSync(featuresDir, { withFileTypes: true });
  let featureCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const featureDir = path.join(featuresDir, entry.name);
    const configPath = path.join(featureDir, 'feature.config.ts');

    if (!fs.existsSync(configPath)) {
      warnings.push(`Feature "${entry.name}": missing feature.config.ts`);
      continue;
    }

    try {
      const mod = await import(pathToFileURL(configPath).href);
      const config = (mod.default ?? mod) as FeatureConfig;

      if (!config.name) {
        errors.push(`Feature "${entry.name}": feature.config.ts missing "name"`);
      }

      if (config.settings) {
        const settingsFile = path.resolve(featureDir, config.settings);
        if (!fs.existsSync(settingsFile)) {
          errors.push(`Feature "${entry.name}": settings file "${config.settings}" not found`);
        }
      }

      featureCount++;
    } catch (err) {
      errors.push(`Feature "${entry.name}": failed to load feature.config.ts: ${err}`);
    }
  }

  if (featureCount === 0) {
    warnings.push('No features with feature.config.ts found');
  }

  return { errors, warnings };
}
