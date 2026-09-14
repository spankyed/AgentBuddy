import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { PackConfig, CompilePackOptions, CompilePackResult } from './types.ts';
import type { PackSeedPreviewItem } from './preview.ts';
import { SPECIALTY_COMPILERS } from './compilers/standard.ts';
import { buildPackConfigFromManifest, resolveFeatureSettingsFromManifest } from './manifest-bridge.ts';
import { seedFile } from './manifest.ts';
import {
  checkRecordEntities, compileBuiltinFormat, formatEntities, recordLabel, withSourceHashes,
  type SeedCompileContext, type SeedCompilerModule, type SeedRecord,
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
  /** The items the import dialog lists, named as include sets name them */
  items(data: T): PackSeedPreviewItem[];
}

/** `seeds.json` in the compiled directory: what each seed key holds */
export interface SeedIndex {
  version: 1;
  seeds: SeedIndexEntry[];
}

export interface SeedIndexEntry {
  key: string;
  /** Seeded into the database (a compile-only entry is read by pack code instead) */
  seeded: boolean;
  /** Fields that name a record: include sets and previews use the first */
  identity?: string[];
  count: number;
  /** Top-level items, named as include sets name them */
  items: PackSeedPreviewItem[];
}

export const SEED_INDEX_FILE = 'seeds.json';

// ============================================================================
// Orchestrator
// ============================================================================

const importFileModule = (file: string) => import(pathToFileURL(file).href) as Promise<Record<string, unknown>>;

function countRecords(records: SeedRecord[]): number {
  return records.reduce((sum, record) => sum + 1 + countRecords(record.children ?? []), 0);
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
 * `media/<key>/` for entries whose format has media, and `seeds.json` indexing them.
 */
export async function compilePack(options: CompilePackOptions): Promise<CompilePackResult> {
  const { packDir, outputDir } = options;
  const importModule = options.importModule ?? importFileModule;
  const { packConfig, featureSettingsPaths } = await loadPackConfig(options);

  if (packConfig.setup) await packConfig.setup();

  console.log(`Compiling pack: ${packConfig.name}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const specialtyData = new Map<string, unknown>();
  const compiled: Array<{ key: string; media?: string; output: unknown; index: SeedIndexEntry }> = [];
  const errors: string[] = [];

  for (const [key, seed] of Object.entries(packConfig.seeds)) {
    if (seed.kind === 'seeder') continue; // the pack's seeder reads its own sources

    const sourcePath = path.resolve(packDir, seed.path);
    if (seed.kind === 'specialty') {
      const specialty = SPECIALTY_COMPILERS[key];
      if (!fs.existsSync(sourcePath)) continue;
      const data = await specialty.compile(sourcePath, { packDir, featureSettingsPaths });
      for (const message of specialty.collectErrors?.(data) ?? []) errors.push(`${key}: ${message}`);
      specialtyData.set(key, data);
      compiled.push({
        key,
        output: specialty.output ? specialty.output(data) : data,
        index: {
          key,
          seeded: true,
          ...((key === 'actions' || key === 'prompts') && { identity: ['label'] }),
          count: specialty.count(data),
          items: specialty.items(data),
        },
      });
      continue;
    }

    const { format } = seed;
    let records: SeedRecord[];
    if (seed.compiler) {
      if (!seed.compiler.module) {
        throw new Error(`Seed "${key}": format "${seed.formatRef}" compiles with a module, but its pack's build dir wasn't resolved (build the dependency first)`);
      }
      const mod = await importModule(seed.compiler.module);
      const compile = mod[seed.compiler.exportName];
      if (typeof compile !== 'function') {
        throw new Error(`Seed "${key}": format "${seed.formatRef}" has no compiler export "${seed.compiler.exportName}" in ${seed.compiler.module}`);
      }
      const context: SeedCompileContext = { key, path: sourcePath, packDir, format };
      records = withSourceHashes(await (compile as SeedCompilerModule)(context));
    } else {
      records = compileBuiltinFormat(key, format, sourcePath);
    }
    errors.push(...checkRecordEntities(key, format, records));
    const seeded = formatEntities(format).length > 0;
    compiled.push({
      key,
      ...(format.media && { media: path.join(sourcePath, format.media) }),
      output: { records },
      index: {
        key,
        seeded,
        ...(format.identity && { identity: format.identity }),
        count: countRecords(records),
        items: !seeded ? [] : records.map((record) => ({
          key: recordLabel(record, format.identity),
          ...(typeof record.description === 'string' && { description: record.description }),
          ...(record.children && { childCount: record.children.length }),
        })),
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
  for (const { key, media, output, index } of compiled) {
    fs.writeFileSync(path.join(outputDir, seedFile(key)), `${JSON.stringify(output, null, 2)}\n`);
    if (media && fs.existsSync(media)) fs.cpSync(media, path.join(mediaRoot, key), { recursive: true });
    console.log(`  ${key}: ${index.count}`);
  }
  const seedIndex: SeedIndex = { version: 1, seeds: compiled.map(({ index }) => index) };
  fs.writeFileSync(path.join(outputDir, SEED_INDEX_FILE), `${JSON.stringify(seedIndex, null, 2)}\n`);

  return { seeds: Object.fromEntries(compiled.map(({ key, index }) => [key, index.count])), warnings: [] };
}
