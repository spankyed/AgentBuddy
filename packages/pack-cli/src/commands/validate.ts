import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginConfig } from '@abuddy/sdk/build';
import { resolveDep } from './fetch-deps';
import { findPackRoot } from '../utils';

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

  if (manifest.seedTypes) {
    if (!Array.isArray(manifest.seedTypes)) {
      errors.push('abuddy.json: "seedTypes" must be an array');
    }
  }

  return { errors, warnings };
}

async function validatePlugins(pluginsDir: string): Promise<ManifestValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(pluginsDir)) {
    warnings.push('No src/plugins/ directory found');
    return { errors, warnings };
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  let pluginCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginDir = path.join(pluginsDir, entry.name);
    const configPath = path.join(pluginDir, 'plugin.config.ts');

    if (!fs.existsSync(configPath)) {
      warnings.push(`Plugin "${entry.name}": missing plugin.config.ts`);
      continue;
    }

    try {
      const mod = await import(pathToFileURL(configPath).href);
      const config = (mod.default ?? mod) as PluginConfig;

      if (!config.name) {
        errors.push(`Plugin "${entry.name}": plugin.config.ts missing "name"`);
      }

      if (config.settings) {
        const settingsFile = path.resolve(pluginDir, config.settings);
        if (!fs.existsSync(settingsFile)) {
          errors.push(`Plugin "${entry.name}": settings file "${config.settings}" not found`);
        }
      }

      pluginCount++;
    } catch (err) {
      errors.push(`Plugin "${entry.name}": failed to load plugin.config.ts: ${err}`);
    }
  }

  if (pluginCount === 0) {
    warnings.push('No plugins with plugin.config.ts found');
  }

  return { errors, warnings };
}

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
  const pluginResult = await validatePlugins(path.join(root, 'src', 'plugins'));
  const depResult = await validateDeps(root, manifestPath);

  const errors = [...manifestResult.errors, ...pluginResult.errors, ...depResult.errors];
  const warnings = [...manifestResult.warnings, ...pluginResult.warnings, ...depResult.warnings];

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
