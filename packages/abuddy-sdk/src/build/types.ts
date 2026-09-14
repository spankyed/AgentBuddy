import type { ResolvedSeed } from './seeds/resolve.ts';

/** A pack's seed sources, as `compilePack` compiles them (built from abuddy.json by buildPackConfigFromManifest) */
export interface PackConfig {
  name: string;
  /** `boot.seed`, each entry resolved to its path, seeder, or format settings */
  seeds: Record<string, ResolvedSeed>;
  /** Registers what compiling needs first, such as the step types flows validate against */
  setup?: () => void | Promise<void>;
}

/**
 * Feature configuration within a pack.
 * Each feature can declare its own settings slice.
 */
export interface FeatureConfig {
  name: string;
  designation?: string;
  settings?: string;    // file path, e.g. './settings.ts'
}

export interface CompilePackOptions {
  packDir: string;
  outputDir: string;
  packConfig?: PackConfig;
  featureSettingsPaths?: Array<{ name: string; settingsPath: string }>;
  /** Loads a compiler module (the pack's own source, or a dependency's seed-compilers.mjs); the CLI loads TypeScript modules with tsx. Defaults to import(). */
  importModule?: (file: string) => Promise<Record<string, unknown>>;
}

export interface CompilePackResult {
  /** Items compiled per seed key */
  seeds: Record<string, number>;
  warnings: string[];
}
