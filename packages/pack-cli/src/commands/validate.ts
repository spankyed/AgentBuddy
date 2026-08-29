import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PackConfig } from '@abuddy/sdk/build';

interface ManifestValidation {
  errors: string[];
  warnings: string[];
}

function validateManifest(manifestPath: string): ManifestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(manifestPath)) {
    errors.push('Missing abuddy.json manifest');
    return { errors, warnings };
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    errors.push('abuddy.json is not valid JSON');
    return { errors, warnings };
  }

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('abuddy.json: missing or invalid "id" field');
  } else if (!/^[a-z][a-z0-9-]*$/.test(manifest.id)) {
    errors.push('abuddy.json: "id" must be lowercase alphanumeric with hyphens');
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('abuddy.json: missing or invalid "name" field');
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('abuddy.json: missing or invalid "version" field');
  }

  if (manifest.hostVersion && typeof manifest.hostVersion !== 'string') {
    warnings.push('abuddy.json: "hostVersion" should be a semver range string');
  }

  if (manifest.artifactTypes) {
    if (!Array.isArray(manifest.artifactTypes)) {
      errors.push('abuddy.json: "artifactTypes" must be an array');
    }
  }

  return { errors, warnings };
}

async function validateFeatures(featuresDir: string): Promise<ManifestValidation> {
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
    const configPath = path.join(featureDir, 'pack.config.ts');

    if (!fs.existsSync(configPath)) {
      warnings.push(`Feature "${entry.name}": missing pack.config.ts`);
      continue;
    }

    try {
      const mod = await import(pathToFileURL(configPath).href);
      const config = (mod.default ?? mod) as PackConfig;

      if (!config.name) {
        errors.push(`Feature "${entry.name}": pack.config.ts missing "name"`);
      }

      if (config.actions) {
        const actionsDir = path.resolve(featureDir, config.actions);
        if (!fs.existsSync(actionsDir)) {
          errors.push(`Feature "${entry.name}": actions dir "${config.actions}" not found`);
        }
      }

      if (config.prompts) {
        const promptsDir = path.resolve(featureDir, config.prompts);
        if (!fs.existsSync(promptsDir)) {
          errors.push(`Feature "${entry.name}": prompts dir "${config.prompts}" not found`);
        }
      }

      if (config.flows) {
        const flowsDir = path.resolve(featureDir, config.flows);
        if (!fs.existsSync(flowsDir)) {
          errors.push(`Feature "${entry.name}": flows dir "${config.flows}" not found`);
        }
      }

      featureCount++;
    } catch (err) {
      errors.push(`Feature "${entry.name}": failed to load pack.config.ts: ${err}`);
    }
  }

  if (featureCount === 0) {
    warnings.push('No features with pack.config.ts found');
  }

  return { errors, warnings };
}

function findPackRoot(from: string): string {
  let dir = from;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'abuddy.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('No abuddy.json found. Run this command from inside a pack directory.');
}

export async function validate(_args: string[]) {
  const root = findPackRoot(process.cwd());
  console.log(`Validating pack at: ${root}`);

  const manifestResult = validateManifest(path.join(root, 'abuddy.json'));
  const featureResult = await validateFeatures(path.join(root, 'src', 'features'));

  const errors = [...manifestResult.errors, ...featureResult.errors];
  const warnings = [...manifestResult.warnings, ...featureResult.warnings];

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  ✗ ${e}`);
    console.log(`\nValidation failed with ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log('\n✓ Pack is valid');
}
