import type { SeedEntryConfig } from './manifest.ts';

/** A pack's seed sources, as `compilePack` compiles them (built from abuddy.json by buildPackConfigFromManifest) */
export interface PackConfig {
  name: string;
  /** `boot.seed`: seed key → path (specialty keys) or entry */
  seeds: Record<string, string | SeedEntryConfig>;
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
  /** Loads a pack's compiler module; the CLI loads TypeScript modules with tsx. Defaults to import(). */
  importModule?: (file: string) => Promise<Record<string, unknown>>;
}

export interface CompilePackResult {
  /** Items compiled per seed key */
  seeds: Record<string, number>;
  warnings: string[];
}
