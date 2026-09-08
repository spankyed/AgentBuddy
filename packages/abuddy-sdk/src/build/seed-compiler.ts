import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { PackConfig, FeatureConfig, CompilePackOptions, CompilePackResult } from './types';
import {
  actionsCompiler, promptsCompiler, flowsCompiler,
  libraryCompiler, notesCompiler, faqCompiler, settingsCompiler,
} from './compilers/standard';
import { stepRegistry } from '../steps/registry';
import { buildPackConfigFromManifest, resolveFeatureSettingsFromManifest } from './manifest-bridge';

// ============================================================================
// Compiler Interface
// ============================================================================

export interface CompileEntry<T> {
  data: T;
  sourcePath: string;
  packName: string;
}

export interface CompilationContext {
  getCompiled<T = unknown>(type: string): T | undefined;
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface SeedCompiler<TCompiled = unknown, TMerged = unknown> {
  compile(sourcePath: string): Promise<TCompiled>;
  merge(entries: CompileEntry<TCompiled>[]): TMerged;
  validate?(merged: TMerged, context: CompilationContext): ValidationResult;
  write(outputDir: string, merged: TMerged): void;
}

// ============================================================================
// Standard Compilers
// ============================================================================

const STANDARD_COMPILERS: Record<string, SeedCompiler> = {
  actions: actionsCompiler,
  prompts: promptsCompiler,
  flows: flowsCompiler,
  library: libraryCompiler,
  notes: notesCompiler,
  faqs: faqCompiler,
  settings: settingsCompiler,
};

function buildCompilerMap(packConfig: PackConfig): Map<string, SeedCompiler> {
  const compilers = new Map<string, SeedCompiler>();

  if (packConfig.compilers) {
    for (const { type, compiler } of packConfig.compilers) {
      compilers.set(type, compiler as SeedCompiler);
    }
  }

  for (const [type, compiler] of Object.entries(STANDARD_COMPILERS)) {
    if (!compilers.has(type)) {
      compilers.set(type, compiler);
    }
  }

  return compilers;
}

// ============================================================================
// Plugin Settings Discovery
// ============================================================================

interface PluginSettings {
  name: string;
  settingsPath: string;
}

async function discoverFeatureSettings(featuresDir: string): Promise<PluginSettings[]> {
  const results: PluginSettings[] = [];
  if (!fs.existsSync(featuresDir)) return results;

  const entries = fs.readdirSync(featuresDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(featuresDir, entry.name);
    const configPath = path.join(dir, 'feature.config.ts');
    if (!fs.existsSync(configPath)) continue;

    const mod = await import(pathToFileURL(configPath).href);
    const config = (mod.default ?? mod) as FeatureConfig;
    if (!config.settings) continue;

    const settingsPath = path.resolve(dir, config.settings);
    if (fs.existsSync(settingsPath)) {
      results.push({ name: config.name, settingsPath });
    }
  }

  return results;
}

// ============================================================================
// Orchestrator
// ============================================================================

export async function compilePack(options: CompilePackOptions): Promise<CompilePackResult> {
  const { packDir, outputDir } = options;

  // 1. Load parent pack config
  let packConfig: PackConfig;
  if (options.packConfig) {
    packConfig = options.packConfig;
  } else {
    const manifestPath = path.join(packDir, 'abuddy.json');
    const manifest = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      : null;

    if (manifest?.boot?.seed) {
      packConfig = await buildPackConfigFromManifest(manifest, packDir);
      if (!options.featureSettingsPaths && manifest.features) {
        options = { ...options, featureSettingsPaths: resolveFeatureSettingsFromManifest(manifest, packDir) };
      }
    } else {
      const packConfigPath = path.join(packDir, 'compile.config.ts');
      if (!fs.existsSync(packConfigPath)) {
        throw new Error(`No boot.seed in abuddy.json and no compile.config.ts found in ${packDir}`);
      }
      const mod = await import(pathToFileURL(packConfigPath).href);
      packConfig = (mod.default ?? mod) as PackConfig;
    }
  }

  const compilers = buildCompilerMap(packConfig);

  if (packConfig.setup) {
    await packConfig.setup();
  }
  if (packConfig.steps) {
    for (const step of packConfig.steps) {
      stepRegistry.register(step);
    }
  }

  // Resolve settings and features paths from config
  const baseSettingsFile = packConfig.settings
    ? path.resolve(packDir, packConfig.settings)
    : undefined;
  const featuresDir = packConfig.features
    ? path.resolve(packDir, packConfig.features)
    : undefined;

  console.log(`Compiling pack: ${packConfig.name}`);
  fs.mkdirSync(outputDir, { recursive: true });

  // 2. Compile seeds from parent pack
  const compiledByType = new Map<string, CompileEntry<unknown>[]>();
  const mergedByType = new Map<string, unknown>();
  const warnings: string[] = [];

  for (const [type, compiler] of compilers) {
    if (type === 'settings') continue;

    const relativePath = packConfig[type];
    if (!relativePath || typeof relativePath !== 'string') continue;

    const sourcePath = path.resolve(packDir, relativePath);
    if (!fs.existsSync(sourcePath)) continue;

    const data = await compiler.compile(sourcePath);
    const entries: CompileEntry<unknown>[] = [{ data, sourcePath, packName: packConfig.name }];
    compiledByType.set(type, entries);

    const merged = compiler.merge(entries);
    mergedByType.set(type, merged);
  }

  // 3. Compile settings — base + per-feature settings merged
  const settingsCompiler = compilers.get('settings');
  if (settingsCompiler) {
    const entries: CompileEntry<unknown>[] = [];

    if (baseSettingsFile && fs.existsSync(baseSettingsFile)) {
      const data = await settingsCompiler.compile(baseSettingsFile);
      entries.push({ data, sourcePath: baseSettingsFile, packName: '_base' });
    }

    const featureSettings = options.featureSettingsPaths
      ?? (featuresDir ? await discoverFeatureSettings(featuresDir) : []);

    if (featureSettings.length > 0) {
      console.log(`Found ${featureSettings.length} feature(s) with settings: ${featureSettings.map(p => p.name).join(', ')}`);

      for (const feature of featureSettings) {
        const data = await settingsCompiler.compile(feature.settingsPath);
        entries.push({ data, sourcePath: feature.settingsPath, packName: feature.name });
      }
    }

    if (entries.length > 0) {
      compiledByType.set('settings', entries);
      const merged = settingsCompiler.merge(entries);
      mergedByType.set('settings', merged);
    }
  }

  // 4. Validate — all types merged, cross-seed context available
  const context: CompilationContext = {
    getCompiled<T>(type: string): T | undefined {
      return mergedByType.get(type) as T | undefined;
    },
  };

  for (const [type, compiler] of compilers) {
    const merged = mergedByType.get(type);
    if (merged === undefined || !compiler.validate) continue;

    const result = compiler.validate(merged, context);
    if (!result.valid) {
      const errMessages = result.errors.map(e => `  ${e.path}: ${e.message}`);
      throw new Error(`${type} validation errors:\n${errMessages.join('\n')}`);
    }
  }

  // 5. Write
  for (const [type, compiler] of compilers) {
    const merged = mergedByType.get(type);
    if (merged === undefined) continue;
    compiler.write(outputDir, merged);
  }

  // 6. Build result
  const seedCounts: Record<string, number> = {};
  for (const [type, entries] of compiledByType) {
    seedCounts[type] = entries.filter(e => e.packName !== '_base').length;
  }

  const result: CompilePackResult = {
    seeds: seedCounts,
    warnings,
  };

  console.log(`\nCompilation complete:`);
  for (const [type, count] of Object.entries(seedCounts)) {
    if (count > 0) console.log(`  ${type}: ${count} source(s)`);
  }
  if (warnings.length) {
    console.log(`  ${warnings.length} warning(s)`);
  }

  return result;
}
