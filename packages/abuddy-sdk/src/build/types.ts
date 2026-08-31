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
  settings?: string;    // file path, e.g. './settings.ts'
  [key: string]: string | undefined;
}

export interface CompilePackOptions {
  packDir: string;
  featuresDir?: string;
  outputDir: string;
  baseSettingsFile?: string;
}

export interface CompilePackResult {
  seeds: Record<string, number>;
  warnings: string[];
}
