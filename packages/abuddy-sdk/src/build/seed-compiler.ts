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
// Pack Discovery
// ============================================================================

interface DiscoveredPack {
  name: string;
  config: PackConfig;
  dir: string;
}

async function discoverPacks(baseDir: string): Promise<DiscoveredPack[]> {
  const packs: DiscoveredPack[] = [];
  if (!fs.existsSync(baseDir)) return packs;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const configPath = path.join(baseDir, entry.name, 'pack.config.ts');
    if (!fs.existsSync(configPath)) continue;

    const mod = await import(pathToFileURL(configPath).href);
    const config = (mod.default ?? mod) as PackConfig;
    packs.push({ name: config.name, dir: path.join(baseDir, entry.name), config });
  }

  return packs;
}

function resolveSourcePath(packDir: string, relativePath: string | undefined): string | null {
  if (!relativePath) return null;
  return path.resolve(packDir, relativePath);
}

// ============================================================================
// Orchestrator
// ============================================================================

export async function compilePack(options: CompilePackOptions): Promise<CompilePackResult> {
  const { featuresDir, sharedDir, outputDir, baseSettingsFile } = options;

  // 1. Discover packs
  const featurePacks = await discoverPacks(featuresDir);
  let sharedPack: DiscoveredPack | null = null;
  if (sharedDir) {
    const sharedConfigPath = path.join(sharedDir, 'pack.config.ts');
    if (fs.existsSync(sharedConfigPath)) {
      const mod = await import(pathToFileURL(sharedConfigPath).href);
      const config = (mod.default ?? mod) as PackConfig;
      sharedPack = { name: config.name, config, dir: sharedDir };
    }
  }

  const allPacks = [...featurePacks, ...(sharedPack ? [sharedPack] : [])];
  console.log(`Found ${allPacks.length} pack(s): ${allPacks.map(p => p.name).join(', ')}`);

  fs.mkdirSync(outputDir, { recursive: true });

  // 2. Compile — for each registered compiler, collect results from all packs
  const compiledByType = new Map<string, CompileEntry<unknown>[]>();
  const mergedByType = new Map<string, unknown>();
  const warnings: string[] = [];

  for (const [type, compiler] of compilers) {
    const entries: CompileEntry<unknown>[] = [];

    // Settings: inject base settings file as a synthetic first entry
    if (type === 'settings' && baseSettingsFile && fs.existsSync(baseSettingsFile)) {
      const data = await compiler.compile(baseSettingsFile);
      entries.push({ data, sourcePath: baseSettingsFile, packName: '_base' });
    }

    for (const pack of allPacks) {
      const sourcePath = resolveSourcePath(pack.dir, pack.config[type]);
      if (!sourcePath || !fs.existsSync(sourcePath)) continue;

      const data = await compiler.compile(sourcePath);
      entries.push({ data, sourcePath, packName: pack.name });
    }

    compiledByType.set(type, entries);

    // 3. Merge
    if (entries.length > 0) {
      const merged = compiler.merge(entries);
      mergedByType.set(type, merged);
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
    if (count > 0) console.log(`  ${count} pack(s) contributed ${type}`);
  }
  if (warnings.length) {
    console.log(`  ${warnings.length} warning(s)`);
  }

  return result;
}
