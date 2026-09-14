import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { PackConfig, CompilePackOptions, CompilePackResult } from './types.ts';
import { SPECIALTY_COMPILERS } from './compilers/standard.ts';
import { buildPackConfigFromManifest, resolveFeatureSettingsFromManifest } from './manifest-bridge.ts';
import { seedFile } from './manifest.ts';
import type { SeedEntryConfig } from './manifest.ts';
import {
  checkRecordEntities, compileFormatEntry, entryEntities, withSourceHashes,
  type SeedCompileContext, type SeedRecord,
} from './seeds/records.ts';

// ============================================================================
// Compiler interface
// ============================================================================

export interface CompilationContext {
  /** Another specialty key's compiled data (flows validate against actions and prompts) */
  getCompiled<T = unknown>(key: string): T | undefined;
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface SpecialtyCompileContext {
  packDir: string;
  /** Feature settings files merged into the settings seed */
  featureSettingsPaths: Array<{ name: string; settingsPath: string }>;
}

/** The SDK's compiler for a specialty seed key (actions, prompts, flows, settings) */
export interface SpecialtyCompiler<T = unknown> {
  compile(sourcePath: string, context: SpecialtyCompileContext): Promise<T>;
  /**
   * Hard failures from `compile` that dropped entries. Reported and thrown before validation, so a
   * dropped entry surfaces at its own source rather than as a downstream cross-seed reference error.
   */
  collectErrors?(data: T): string[];
  validate?(data: T, context: CompilationContext): ValidationResult;
  /** What `<key>.seed.json` holds; the compiled data itself when omitted */
  output?(data: T): unknown;
  /** Items compiled, for the build summary */
  count(data: T): number;
}

/** `seeds.json` in the compiled directory: what each seed key holds */
export interface SeedIndex {
  version: 1;
  seeds: SeedIndexEntry[];
}

export interface SeedIndexEntry {
  key: string;
  /** Seeded into the database (compile-only entries, like FAQs, are read by pack code instead) */
  seeded: boolean;
  /** Fields that name a record: include sets and previews use the first */
  identity?: string[];
  count: number;
}

export const SEED_INDEX_FILE = 'seeds.json';

// ============================================================================
// Orchestrator
// ============================================================================

const importFileModule = (file: string) => import(pathToFileURL(file).href) as Promise<Record<string, unknown>>;

function countRecords(records: SeedRecord[]): number {
  return records.reduce((sum, record) => sum + 1 + countRecords(record.children ?? []), 0);
}

function normalizeEntry(raw: string | SeedEntryConfig): SeedEntryConfig {
  return typeof raw === 'string' ? { path: raw } : raw;
}

async function loadPackConfig(options: CompilePackOptions): Promise<{ packConfig: PackConfig; featureSettingsPaths: SpecialtyCompileContext['featureSettingsPaths'] }> {
  if (options.packConfig) {
    return { packConfig: options.packConfig, featureSettingsPaths: options.featureSettingsPaths ?? [] };
  }
  const manifestPath = path.join(options.packDir, 'abuddy.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`No abuddy.json in ${options.packDir}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return {
    packConfig: await buildPackConfigFromManifest(manifest, options.packDir),
    featureSettingsPaths: options.featureSettingsPaths ?? resolveFeatureSettingsFromManifest(manifest, options.packDir),
  };
}

/**
 * Compiles a pack's `boot.seed` entries into `outputDir`: `<key>.seed.json` for each entry,
 * `media/<key>/` for entries with media, and `seeds.json` indexing them.
 */
export async function compilePack(options: CompilePackOptions): Promise<CompilePackResult> {
  const { packDir, outputDir } = options;
  const importModule = options.importModule ?? importFileModule;
  const { packConfig, featureSettingsPaths } = await loadPackConfig(options);

  if (packConfig.setup) await packConfig.setup();

  console.log(`Compiling pack: ${packConfig.name}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const specialtyData = new Map<string, unknown>();
  const compiled: Array<{ key: string; entry: SeedEntryConfig; output: unknown; index: SeedIndexEntry }> = [];
  const errors: string[] = [];

  for (const [key, raw] of Object.entries(packConfig.seeds)) {
    const entry = normalizeEntry(raw);
    const sourcePath = entry.path ? path.resolve(packDir, entry.path) : undefined;
    const specialty = SPECIALTY_COMPILERS[key];

    if (specialty) {
      if (!sourcePath || !fs.existsSync(sourcePath)) continue;
      const data = await specialty.compile(sourcePath, { packDir, featureSettingsPaths });
      for (const message of specialty.collectErrors?.(data) ?? []) errors.push(`${key}: ${message}`);
      specialtyData.set(key, data);
      compiled.push({
        key,
        entry,
        output: specialty.output ? specialty.output(data) : data,
        index: {
          key,
          seeded: true,
          ...((key === 'actions' || key === 'prompts') && { identity: ['label'] }),
          count: specialty.count(data),
        },
      });
      continue;
    }

    let records: SeedRecord[];
    if (entry.compiler) {
      const modulePath = path.resolve(packDir, entry.compiler);
      const mod = await importModule(modulePath);
      const compile = mod.default;
      if (typeof compile !== 'function') throw new Error(`Seed "${key}": ${entry.compiler} has no default export compiling records`);
      const context: SeedCompileContext = { key, path: sourcePath!, packDir, entry };
      records = withSourceHashes(await (compile as (context: SeedCompileContext) => SeedRecord[] | Promise<SeedRecord[]>)(context));
    } else if (entry.format) {
      records = compileFormatEntry(key, entry, sourcePath!);
    } else {
      // A seeder-only entry: the pack's seeder reads its own sources
      continue;
    }
    errors.push(...checkRecordEntities(key, entry, records));
    compiled.push({
      key,
      entry,
      output: { records },
      index: {
        key,
        seeded: entryEntities(entry).length > 0 || entry.seeder !== undefined,
        ...(entry.identity && { identity: entry.identity }),
        count: countRecords(records),
      },
    });
  }

  if (errors.length > 0) {
    throw new Error(`${errors.length} seed source(s) failed to compile:\n${errors.map((e) => `  ✗ ${e}`).join('\n')}`);
  }

  const context: CompilationContext = {
    getCompiled: <T>(key: string) => specialtyData.get(key) as T | undefined,
  };
  for (const [key, data] of specialtyData) {
    const result = SPECIALTY_COMPILERS[key].validate?.(data, context);
    if (result && !result.valid) {
      throw new Error(`${key} validation errors:\n${result.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`);
    }
  }

  const mediaRoot = path.join(outputDir, 'media');
  for (const { key, entry, output, index } of compiled) {
    fs.writeFileSync(path.join(outputDir, seedFile(key)), `${JSON.stringify(output, null, 2)}\n`);
    if (entry.media && entry.path) {
      const mediaSource = path.join(packDir, entry.path, entry.media);
      if (fs.existsSync(mediaSource)) fs.cpSync(mediaSource, path.join(mediaRoot, key), { recursive: true });
    }
    console.log(`  ${key}: ${index.count}`);
  }
  const seedIndex: SeedIndex = { version: 1, seeds: compiled.map(({ index }) => index) };
  fs.writeFileSync(path.join(outputDir, SEED_INDEX_FILE), `${JSON.stringify(seedIndex, null, 2)}\n`);

  return { seeds: Object.fromEntries(compiled.map(({ key, index }) => [key, index.count])), warnings: [] };
}
