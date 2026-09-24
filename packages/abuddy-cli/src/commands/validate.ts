import * as path from 'node:path';
import { generatePackFiles, validateManifest, validateFeatures } from '@abuddy/sdk/build';
import { resolveDep } from './fetch-deps';
import { resolveDeps } from './generate';
import { findPackRoot, readManifest } from '../utils';
import { errorMessage } from '@abuddy/sdk/utils/pure';

/**
 * Warnings only: an unresolved dependency is fixable with "abuddy fetch-deps", and `abuddy build`
 * is what refuses to build without it.
 */
async function validateDeps(root: string): Promise<string[]> {
  let deps: Record<string, string> | undefined;
  try {
    // A missing or unparsable manifest is already reported by validateManifest
    deps = readManifest(root).dependencies;
  } catch {
    return [];
  }
  if (!deps) return [];

  const warnings: string[] = [];
  for (const [depId, depValue] of Object.entries(deps)) {
    try {
      const resolved = await resolveDep(root, depId, depValue);
      if (!resolved) warnings.push(`Dependency "${depId}" could not be resolved — run "abuddy fetch-deps"`);
    } catch (err) {
      // Found only in builds this CLI can't use: the message names each one and why
      warnings.push(errorMessage(err));
    }
  }
  return warnings;
}

/**
 * The checks code generation makes (seed formats' entities, dependency formats, seed hook and service
 * exports, …), run in memory without writing. Skipped while a dependency is unresolved: validateDeps
 * reports that, and these checks need the dependency's manifest. Types that don't resolve (the pack's
 * `@abuddy/sdk` not installed) are a warning, not the pack's error.
 */
async function validateCodegen(root: string): Promise<{ errors: string[]; warnings: string[] }> {
  const manifest = readManifest(root);
  let resolved: Awaited<ReturnType<typeof resolveDeps>>;
  try {
    resolved = await resolveDeps(root, manifest.dependencies);
  } catch {
    return { errors: [], warnings: [] };
  }
  try {
    generatePackFiles(manifest, { packRoot: root, ...resolved });
    return { errors: [], warnings: [] };
  } catch (err) {
    // Whatever stopped code generation stopped the checks after it too. A pack whose dependencies aren't
    // installed reads the same as one with a mistake, and always did — the code that claimed otherwise was
    // reading a value that resolves to `any` when an import fails.
    return { errors: [errorMessage(err)], warnings: [] };
  }
}

export async function validate(_args: string[]) {
  const root = findPackRoot(process.cwd());
  console.log(`Validating pack at: ${root}`);

  const manifestPath = path.join(root, 'abuddy.json');
  const manifestResult = validateManifest(manifestPath);
  // Checked against the pack only when the manifest parses: its features[] is what's on disk to check
  const featureResult = manifestResult.errors.length === 0
    ? validateFeatures(root, readManifest(root))
    : { errors: [], warnings: [] };
  const depWarnings = await validateDeps(root);
  // Codegen stops at its first problem, so it runs only once the manifest and features check out
  const codegen = manifestResult.errors.length === 0 && featureResult.errors.length === 0 ? await validateCodegen(root) : { errors: [], warnings: [] };

  const errors = [...manifestResult.errors, ...featureResult.errors, ...codegen.errors];
  const warnings = [...manifestResult.warnings, ...featureResult.warnings, ...depWarnings, ...codegen.warnings];

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
