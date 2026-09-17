import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { PackBuildDefinitions, PackConfig } from './types.ts';
import type { PackManifest } from './manifest.ts';
import type { StepDefinition } from '../steps/types.ts';
import { mergeStepDefinitions } from '../steps/merge.ts';
import { resolveSeeds, type SeedDependency } from './seeds/resolve.ts';

function findExportedArray(mod: Record<string, unknown>): unknown[] | null {
  for (const value of Object.values(mod)) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

export interface PackConfigOptions {
  /**
   * Dependencies' build/steps.build.mjs modules. Loaded before this pack's own
   * steps so flows can use dependency steps and are validated with their real code.
   */
  dependencyStepModules?: string[];
  /** Dependencies whose seed formats this pack's entries may name */
  dependencies?: ReadonlyMap<string, SeedDependency>;
}

export async function buildPackConfigFromManifest(
  manifest: PackManifest,
  packDir: string,
  options: PackConfigOptions = {},
): Promise<PackConfig> {
  return {
    name: manifest.id,
    seeds: resolveSeeds(manifest, packDir, options.dependencies),
    loadDefinitions: () => loadPackDefinitions(manifest, packDir, options.dependencyStepModules ?? []),
  };
}

/** Merges a step definition into the one of its type, facet by facet (a build facet and a runtime one combine) */
function mergeStep(steps: Map<string, StepDefinition>, def: StepDefinition): void {
  const existing = steps.get(def.type);
  steps.set(def.type, existing ? mergeStepDefinitions(existing, def) : def);
}

/**
 * The definitions a pack compiles with: its dependencies' steps (their build/steps.build.mjs), then its own
 * steps, artifacts and blocks. A pack step whose type a dependency defines throws.
 */
async function loadPackDefinitions(manifest: PackManifest, packDir: string, dependencyStepModules: readonly string[]): Promise<PackBuildDefinitions> {
  const steps = new Map<string, StepDefinition>();
  // Step type → dependency module defining it; a pack step with the same type would silently
  // merge over the dependency's definition
  const dependencyStepTypes = new Map<string, string>();
  for (const modulePath of dependencyStepModules) {
    const mod = await import(pathToFileURL(modulePath).href);
    const items = findExportedArray(mod);
    if (!items) throw new Error(`${modulePath} does not export a step definition array`);
    for (const item of items as StepDefinition[]) {
      dependencyStepTypes.set(item.type, modulePath);
      mergeStep(steps, item);
    }
  }

  const loadArray = async (relPath: string | undefined, label: string): Promise<unknown[]> => {
    if (!relPath) return [];
    const fullPath = path.resolve(packDir, relPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`Warning: ${label} file not found at ${relPath}`);
      return [];
    }
    return findExportedArray(await import(pathToFileURL(fullPath).href)) ?? [];
  };

  // Build-only definitions avoid loading runtime and FE code (Vue components) in the CLI
  for (const step of await loadArray(manifest.steps?.build ?? manifest.steps?.register, 'steps') as StepDefinition[]) {
    const dependency = dependencyStepTypes.get(step.type);
    if (dependency) {
      throw new Error(`Step type "${step.type}" is defined by this pack and by a dependency (${dependency}); rename this pack's step`);
    }
    mergeStep(steps, step);
  }

  return {
    steps: [...steps.values()],
    artifacts: await loadArray(manifest.artifacts, 'artifacts') as PackBuildDefinitions['artifacts'],
    blocks: await loadArray(manifest.blocks, 'blocks') as PackBuildDefinitions['blocks'],
  };
}
