import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { PackConfig } from './types.js';
import type { PackManifest } from './manifest.js';
import { stepRegistry } from '../steps/registry.js';
import { artifactRegistry } from '../artifacts/registry.js';
import { blockRegistry } from '../blocks/registry.js';

function findExportedArray(mod: Record<string, unknown>): unknown[] | null {
  for (const value of Object.values(mod)) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

export interface PackConfigOptions {
  /**
   * Dependencies' build/steps.build.mjs modules. Registered before this pack's own
   * steps so flows can use dependency steps and are validated with their real code.
   */
  dependencyStepModules?: string[];
}

export async function buildPackConfigFromManifest(
  manifest: PackManifest,
  packDir: string,
  options: PackConfigOptions = {},
): Promise<PackConfig> {
  const config: PackConfig = {
    name: manifest.id,
    ...(manifest.boot?.seed as Record<string, string> | undefined),
    async setup() {
      // Step type → dependency module defining it; a pack step with the same type would silently
      // merge over the dependency's definition in the registry
      const dependencyStepTypes = new Map<string, string>();
      for (const modulePath of options.dependencyStepModules ?? []) {
        const mod = await import(pathToFileURL(modulePath).href);
        const items = findExportedArray(mod);
        if (!items) throw new Error(`${modulePath} does not export a step definition array`);
        for (const item of items) {
          dependencyStepTypes.set((item as { type: string }).type, modulePath);
          stepRegistry.register(item as never);
        }
      }
      const registerPackStep = (step: { type: string }) => {
        const dependency = dependencyStepTypes.get(step.type);
        if (dependency) {
          throw new Error(`Step type "${step.type}" is defined by this pack and by a dependency (${dependency}); rename this pack's step`);
        }
        stepRegistry.register(step as never);
      };

      const registrations: Array<{
        path: string | undefined;
        register: (item: any) => void;
        label: string;
      }> = [
        // Build-only definitions avoid loading runtime and FE code (Vue components) in the CLI
        { path: manifest.steps?.build ?? manifest.steps?.register, register: registerPackStep, label: 'steps' },
        { path: manifest.artifacts, register: (a) => artifactRegistry.register(a), label: 'artifacts' },
        { path: manifest.blocks, register: (b) => blockRegistry.register(b), label: 'blocks' },
      ];

      for (const { path: relPath, register, label } of registrations) {
        if (!relPath) continue;
        const fullPath = path.resolve(packDir, relPath);
        if (!fs.existsSync(fullPath)) {
          console.warn(`Warning: ${label} file not found at ${relPath}`);
          continue;
        }
        const mod = await import(pathToFileURL(fullPath).href);
        const items = findExportedArray(mod);
        if (items) {
          for (const item of items) register(item);
        }
      }
    },
  };

  return config;
}

export function resolveFeatureSettingsFromManifest(
  manifest: PackManifest,
  packDir: string,
): Array<{ name: string; settingsPath: string }> {
  if (!manifest.features?.length) return [];

  const results: Array<{ name: string; settingsPath: string }> = [];
  for (const feature of manifest.features) {
    if (!feature.settings) continue;
    const settingsPath = path.resolve(packDir, feature.settings);
    if (fs.existsSync(settingsPath)) {
      results.push({ name: feature.id, settingsPath });
    }
  }
  return results;
}
