import type { ResolvedSeed } from './seeds/resolve.ts';
import type { StepDefinition } from '../steps/types.ts';
import type { ArtifactDefinition } from '../artifacts/types.ts';
import type { BlockDefinition } from '../blocks/types.ts';

/** The step, artifact and block definitions a pack compiles with: its dependencies' and its own */
export interface PackBuildDefinitions {
  steps: StepDefinition[];
  artifacts: ArtifactDefinition[];
  blocks: BlockDefinition[];
}

/** A pack's seed sources, as `compilePack` compiles them (built from abuddy.json by buildPackConfigFromManifest) */
export interface PackConfig {
  name: string;
  /** `boot.seed`, each entry resolved to its path, seeder, or format settings */
  seeds: Record<string, ResolvedSeed>;
  /** Loads the definitions compiling validates against, such as the step types flows use */
  loadDefinitions?: () => Promise<PackBuildDefinitions>;
}

export interface CompilePackOptions {
  packDir: string;
  outputDir: string;
  packConfig?: PackConfig;
  /** The definitions to compile with; the pack config's (`loadDefinitions`) by default, none without one */
  definitions?: PackBuildDefinitions;
  /** Loads a compiler module (the pack's own source, or a dependency's seed-compilers.mjs); the CLI loads TypeScript modules with tsx. Defaults to import(). */
  importModule?: (file: string) => Promise<Record<string, unknown>>;
  /** Progress lines (the pack and each key's item count); defaults to console.log */
  log?: (message: string) => void;
}

export interface CompilePackResult {
  /** Items compiled per seed key */
  seeds: Record<string, number>;
  warnings: string[];
}
