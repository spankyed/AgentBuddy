/**
 * Pack seed declaration.
 * A pack declares what seed types it provides.
 * Paths are relative to the pack.config.ts file location.
 */
export interface PackConfig {
  name: string;
  actions?: string;     // directory path, e.g. './actions'
  prompts?: string;     // directory path
  flows?: string;       // directory path
  library?: string;     // directory path
  notes?: string;       // directory path
  faqs?: string;        // directory path
  settings?: string;    // file path, e.g. './settings.ts' — base settings for the pack
  features?: string;    // directory path, e.g. './src/features' — scanned for per-feature settings
  compilers?: Array<{ type: string; compiler: import('./seed-compiler').SeedCompiler }>;
  steps?: import('../steps/types').StepDefinition[];
  setup?: () => void | Promise<void>;
  [key: string]: unknown;
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
}

export interface CompilePackResult {
  seeds: Record<string, number>;
  warnings: string[];
}
