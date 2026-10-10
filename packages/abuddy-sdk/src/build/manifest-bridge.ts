import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { PackBuildDefinitions, PackConfig } from './types.ts';
import type { PackManifest } from './manifest.ts';
import type { StepDefinition } from '../steps/types.ts';
import { _mergeStepDefinitions } from '../steps/merge.ts';
import { resolveContentSources, type ContentDependency } from './content/resolve.ts';
import { STEPS_BUILD_MODULE } from './generate-entries.ts';

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
  /** Dependencies whose content formats this pack's entries may name */
  dependencies?: ReadonlyMap<string, ContentDependency>;
}

export async function buildPackConfigFromManifest(
  manifest: PackManifest,
  packDir: string,
  options: PackConfigOptions = {},
): Promise<PackConfig> {
  return {
    name: manifest.id,
    // Both sections compile the same way; only an artifact is never written, which its format says
    sources: {
      ...resolveContentSources(manifest, packDir, options.dependencies),
      ...resolveContentSources(manifest, packDir, options.dependencies, 'artifacts'),
    },
    loadDefinitions: () => loadPackDefinitions(manifest, packDir, options.dependencyStepModules ?? []),
  };
}

/** Merges a step definition into the one of its type, facet by facet (a build facet and a runtime one combine) */
function mergeStep(steps: Map<string, StepDefinition>, def: StepDefinition): void {
  const existing = steps.get(def.type);
  steps.set(def.type, existing ? _mergeStepDefinitions(existing, def) : def);
}

/**
 * The definitions a pack compiles with: its dependencies' steps (their build/steps.build.mjs), then its own
 * steps, plus the artifacts and blocks its manifest declares. A pack step whose type a dependency defines throws.
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

  // Build-only definitions avoid loading runtime and FE code (Vue components) in the CLI: codegen writes
  // the pack's build facets into this module, and the build bundles it for dependents
  for (const step of await loadArray(STEPS_BUILD_MODULE, 'steps') as StepDefinition[]) {
    const dependency = dependencyStepTypes.get(step.type);
    if (dependency) {
      throw new Error(`Step type "${step.type}" is defined by this pack and by a dependency (${dependency}); rename this pack's step`);
    }
    mergeStep(steps, step);
  }

  return {
    steps: [...steps.values()],
    // Both are declared outright in the manifest, so nothing is loaded for either: what a build needs of an
    // artifact or a block is its type and, for a block, its kind. The facets are code only a running app reaches
    artifacts: Object.keys(manifest.extensions?.artifacts ?? {}).map((type) => ({ type })),
    blocks: Object.entries(manifest.extensions?.blocks ?? {}).map(([type, entry]) => ({ type, kind: entry.kind })),
  };
}
