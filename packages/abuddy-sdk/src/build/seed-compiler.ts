import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { PackConfig, CompilePackOptions, CompilePackResult } from './types';

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

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

export interface SeedCompiler<TCompiled = unknown, TMerged = unknown> {
  compile(sourcePath: string): Promise<TCompiled>;
  merge(entries: CompileEntry<TCompiled>[]): TMerged;
  validate?(merged: TMerged, context: CompilationContext): ValidationResult;
  write(outputDir: string, merged: TMerged): void;
}

// ============================================================================
// Registry
// ============================================================================

const compilers = new Map<string, SeedCompiler>();

export function registerSeedCompiler<TC, TM>(type: string, compiler: SeedCompiler<TC, TM>): void {
  compilers.set(type, compiler as SeedCompiler);
}

export function getSeedCompiler(type: string): SeedCompiler | undefined {
  return compilers.get(type);
}

export function getRegisteredSeedTypes(): string[] {
  return Array.from(compilers.keys());
}

// ============================================================================
// Feature Settings Discovery
// ============================================================================

interface FeatureSettings {
  name: string;
  settingsPath: string;
}

async function discoverFeatureSettings(featuresDir: string): Promise<FeatureSettings[]> {
  const results: FeatureSettings[] = [];
  if (!fs.existsSync(featuresDir)) return results;

  const entries = fs.readdirSync(featuresDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const configPath = path.join(featuresDir, entry.name, 'pack.config.ts');
    if (!fs.existsSync(configPath)) continue;

    const mod = await import(pathToFileURL(configPath).href);
    const config = (mod.default ?? mod) as PackConfig;
    if (!config.settings) continue;

    const settingsPath = path.resolve(path.join(featuresDir, entry.name), config.settings);
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
  const { packDir, featuresDir, outputDir, baseSettingsFile } = options;

  // 1. Load parent pack config
  const packConfigPath = path.join(packDir, 'pack.config.ts');
  if (!fs.existsSync(packConfigPath)) {
    throw new Error(`No pack.config.ts found in ${packDir}`);
  }
  const mod = await import(pathToFileURL(packConfigPath).href);
  const packConfig = (mod.default ?? mod) as PackConfig;

  console.log(`Compiling pack: ${packConfig.name}`);
  fs.mkdirSync(outputDir, { recursive: true });

  // 2. Compile seeds from parent pack
  const compiledByType = new Map<string, CompileEntry<unknown>[]>();
  const mergedByType = new Map<string, unknown>();
  const warnings: string[] = [];

  for (const [type, compiler] of compilers) {
    if (type === 'settings') continue;

    const relativePath = packConfig[type];
    if (!relativePath) continue;

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

    if (featuresDir) {
      const featureSettings = await discoverFeatureSettings(featuresDir);
      console.log(`Found ${featureSettings.length} feature(s) with settings: ${featureSettings.map(f => f.name).join(', ')}`);

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
