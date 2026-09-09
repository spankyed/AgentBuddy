import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateManifest, validateFeatures, type ManifestValidation } from '../../build';
import { resolveDep } from './fetch-deps';
import { findPackRoot } from '../utils';

async function validateDeps(root: string, manifestPath: string): Promise<ManifestValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(manifestPath)) return { errors, warnings };

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return { errors, warnings };
  }

  const deps = manifest.dependencies as Record<string, string> | undefined;
  if (!deps || Object.keys(deps).length === 0) return { errors, warnings };

  for (const [depId, depValue] of Object.entries(deps)) {
    const resolved = await resolveDep(root, depId, depValue);
    if (!resolved) {
      warnings.push(`Dependency "${depId}" could not be resolved — run "abuddy fetch-deps"`);
    }
  }

  return { errors, warnings };
}

export async function validate(_args: string[]) {
  const root = findPackRoot(process.cwd());
  console.log(`Validating pack at: ${root}`);

  const manifestPath = path.join(root, 'abuddy.json');
  const manifestResult = validateManifest(manifestPath);
  const featureResult = await validateFeatures(path.join(root, 'src', 'features'));
  const depResult = await validateDeps(root, manifestPath);

  const errors = [...manifestResult.errors, ...featureResult.errors, ...depResult.errors];
  const warnings = [...manifestResult.warnings, ...featureResult.warnings, ...depResult.warnings];

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  x ${e}`);
    console.log(`\nValidation failed with ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log('\n+ Pack is valid');
}
