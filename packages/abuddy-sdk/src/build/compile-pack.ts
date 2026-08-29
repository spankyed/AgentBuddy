import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { PackConfig } from './types';
import type { FlowDSL, CompiledFAQ } from './dsl-types';
import { compileSourceDir, type CompiledEntry } from './compile-utils';
import { loadFlowsFromDir, validateFlows, hashFlows } from './compile-flows';
import { compileLibraryFromDir, copyLibraryMedia } from './compile-library';
import { compileNotesFromDir, copyNotesMedia, countNotes } from './compile-notes';
import { compileFaqFromDir } from './compile-faq';
import { loadSettingsFromFile, deepMerge } from './compile-settings';
import { countDocs } from './library-utils';

export interface CompilePackOptions {
  featuresDir: string;
  sharedDir?: string;
  outputDir: string;
  baseSettingsFile?: string;
}

export interface CompilePackResult {
  actions: number;
  prompts: number;
  flows: number;
  libraryDocs: number;
  notes: number;
  faqs: number;
  warnings: string[];
}

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
    packs.push({
      name: config.name,
      config,
      dir: path.join(baseDir, entry.name),
    });
  }

  return packs;
}

function resolveDir(base: string, relative: string | undefined): string | null {
  if (!relative) return null;
  return path.resolve(base, relative);
}

export async function compilePack(options: CompilePackOptions): Promise<CompilePackResult> {
  const { featuresDir, sharedDir, outputDir, baseSettingsFile } = options;
  const warnings: string[] = [];

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

  // --- Phase 1: Per-feature compile ---

  const allActions: CompiledEntry[] = [];
  const allPrompts: CompiledEntry[] = [];
  const mergedFlows: FlowDSL = {};
  let mergedLibrary = { version: 1, items: [] as any[] };
  let mergedNotes = { version: 1, notes: [] as any[] };
  const allFaqs: CompiledFAQ[] = [];
  let mergedSettings: Record<string, any> = {};

  // Load base settings first
  if (baseSettingsFile && fs.existsSync(baseSettingsFile)) {
    mergedSettings = await loadSettingsFromFile(baseSettingsFile);
    console.log(`  Loaded base settings from ${path.relative(process.cwd(), baseSettingsFile)}`);
  }

  const actionConfig = {
    functionName: 'action',
    isAsync: true,
    fields: { metaInput: 'input', fnBody: 'actionFn', output: 'output' },
  };
  const promptConfig = {
    functionName: 'template',
    isAsync: false,
    fields: { metaInput: 'inputs', fnBody: 'templateFn', output: 'outputSchema' },
  };

  for (const pack of allPacks) {
    const { config, dir, name } = pack;

    // Actions
    const actionsDir = resolveDir(dir, config.actions);
    if (actionsDir) {
      const result = await compileSourceDir(actionsDir, actionConfig);
      warnings.push(...result.warnings);
      allActions.push(...result.entries);
      if (result.entries.length) console.log(`  ${name}: ${result.entries.length} action(s)`);
    }

    // Prompts
    const promptsDir = resolveDir(dir, config.prompts);
    if (promptsDir) {
      const result = await compileSourceDir(promptsDir, promptConfig);
      warnings.push(...result.warnings);
      allPrompts.push(...result.entries);
      if (result.entries.length) console.log(`  ${name}: ${result.entries.length} prompt(s)`);
    }

    // Flows
    const flowsDir = resolveDir(dir, config.flows);
    if (flowsDir) {
      const result = await loadFlowsFromDir(flowsDir);
      for (const [flowName, flowEntry] of Object.entries(result.merged)) {
        if (mergedFlows[flowName]) {
          throw new Error(`Duplicate flow name "${flowName}" across packs (found in ${name})`);
        }
        mergedFlows[flowName] = flowEntry;
      }
      if (result.loaded) console.log(`  ${name}: ${Object.keys(result.merged).length} flow(s)`);
    }

    // Library
    const libraryDir = resolveDir(dir, config.library);
    if (libraryDir) {
      const result = compileLibraryFromDir(libraryDir);
      mergedLibrary.items.push(...result.items);
      copyLibraryMedia(libraryDir, outputDir);
    }

    // Notes
    const notesDir = resolveDir(dir, config.notes);
    if (notesDir) {
      const result = compileNotesFromDir(notesDir);
      mergedNotes.notes.push(...result.notes);
      copyNotesMedia(notesDir, outputDir);
    }

    // FAQs
    const faqsDir = resolveDir(dir, config.faqs);
    if (faqsDir) {
      const result = compileFaqFromDir(faqsDir);
      allFaqs.push(...result);
    }

    // Settings
    const settingsFile = resolveDir(dir, config.settings);
    if (settingsFile && fs.existsSync(settingsFile)) {
      const featureSettings = await loadSettingsFromFile(settingsFile);
      mergedSettings = deepMerge(mergedSettings, featureSettings);
    }
  }

  // --- Phase 2: Cross-feature validation + merge ---

  // Check for duplicate action/prompt labels
  const actionLabels = allActions.map(a => a.label);
  const promptLabels = allPrompts.map(p => p.label);

  const dupActions = findDuplicates(actionLabels);
  if (dupActions.length) {
    throw new Error(`Duplicate action labels: ${dupActions.join(', ')}`);
  }
  const dupPrompts = findDuplicates(promptLabels);
  if (dupPrompts.length) {
    throw new Error(`Duplicate prompt labels: ${dupPrompts.join(', ')}`);
  }

  // Validate flows against merged actions + prompts
  if (Object.keys(mergedFlows).length > 0) {
    const validation = validateFlows(mergedFlows, actionLabels, promptLabels);
    if (!validation.valid) {
      const errMessages = validation.errors.map(e => `  ${e.path}: ${e.message}`);
      throw new Error(`Flow validation errors:\n${errMessages.join('\n')}`);
    }
  }

  // Sort FAQs
  allFaqs.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  // --- Phase 3: Write output ---

  fs.mkdirSync(outputDir, { recursive: true });

  writeJson(path.join(outputDir, 'compiled-actions.json'), allActions);
  writeJson(path.join(outputDir, 'compiled-prompts.json'), allPrompts);
  writeJson(path.join(outputDir, 'compiled-flows.json'), Object.keys(mergedFlows).length > 0 ? hashFlows(mergedFlows) : {});
  writeJson(path.join(outputDir, 'compiled-library.json'), mergedLibrary);
  writeJson(path.join(outputDir, 'compiled-notes.json'), mergedNotes);
  writeJson(path.join(outputDir, 'compiled-faq.json'), allFaqs);
  writeJson(path.join(outputDir, 'compiled-settings.json'), mergedSettings);

  const result: CompilePackResult = {
    actions: allActions.length,
    prompts: allPrompts.length,
    flows: Object.keys(mergedFlows).length,
    libraryDocs: countDocs(mergedLibrary.items),
    notes: countNotes(mergedNotes.notes),
    faqs: allFaqs.length,
    warnings,
  };

  console.log(`\nCompilation complete:`);
  console.log(`  ${result.actions} action(s), ${result.prompts} prompt(s), ${result.flows} flow(s)`);
  console.log(`  ${result.libraryDocs} library doc(s), ${result.notes} note(s), ${result.faqs} faq(s)`);
  if (warnings.length) {
    console.log(`  ${warnings.length} warning(s)`);
  }

  return result;
}

function writeJson(filePath: string, data: any): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function findDuplicates(arr: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const item of arr) {
    if (seen.has(item)) dups.add(item);
    seen.add(item);
  }
  return Array.from(dups);
}
