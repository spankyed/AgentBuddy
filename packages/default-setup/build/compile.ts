import * as fs from 'fs';
import * as path from 'path';
import { compileSourceDir, type CompiledEntry } from './compile-utils';
import { loadFlowsFromDir, validateFlows, hashFlows } from './compile-flows';
import { compileLibraryFromDir, copyLibraryMedia } from './compile-library';
import { compileNotesFromDir, copyNotesMedia } from './compile-notes';
import { loadSettingsFromFile, deepMerge } from './compile-settings';
import { compileFaqFromDir } from './compile-faq';
import { compilePack } from './compile-pack';
import type { FlowDSL } from './dsl-types';

const baseDir = path.resolve(import.meta.dirname, '..');

function resolve(relative: string): string {
  return path.join(baseDir, relative);
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/** Discover all subdirs of src/features/* that contain a given artifact type. */
function discoverFeatureDirs(artifactType: string): string[] {
  const featuresRoot = resolve('src/features');
  if (!fs.existsSync(featuresRoot)) return [];
  return fs.readdirSync(featuresRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(featuresRoot, d.name, artifactType))
    .filter(dir => fs.existsSync(dir));
}

/** Collect all source directories for an artifact type (feature dirs + shared). */
function collectSourceDirs(artifactType: string): string[] {
  const dirs = discoverFeatureDirs(artifactType);
  const sharedDir = resolve('src/shared/' + artifactType);
  if (fs.existsSync(sharedDir)) dirs.push(sharedDir);
  return dirs;
}

async function compileActions(): Promise<void> {
  const dirs = collectSourceDirs('actions');
  const outputFile = resolve('dist/compiled-actions.json');
  const allEntries: CompiledEntry[] = [];
  const allWarnings: string[] = [];

  for (const dir of dirs) {
    console.log(`Compiling actions from: ${dir}`);
    const result = await compileSourceDir(dir, {
      functionName: 'action',
      isAsync: true,
      fields: { metaInput: 'input', fnBody: 'actionFn', output: 'output' },
    });
    for (const entry of result.entries) console.log(`  + ${entry.label}`);
    allEntries.push(...result.entries);
    allWarnings.push(...result.warnings);
  }

  if (allWarnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of allWarnings) console.warn(`  ! ${w}`);
  }

  writeJson(outputFile, allEntries);
  console.log(`\nCompiled ${allEntries.length} action(s)`);
}

async function compilePrompts(): Promise<void> {
  const dirs = collectSourceDirs('prompts');
  const outputFile = resolve('dist/compiled-prompts.json');
  const allEntries: CompiledEntry[] = [];
  const allWarnings: string[] = [];

  for (const dir of dirs) {
    console.log(`Compiling prompts from: ${dir}`);
    const result = await compileSourceDir(dir, {
      functionName: 'template',
      isAsync: false,
      fields: { metaInput: 'inputs', fnBody: 'templateFn', output: 'outputSchema' },
    });
    for (const entry of result.entries) console.log(`  + ${entry.label}`);
    allEntries.push(...result.entries);
    allWarnings.push(...result.warnings);
  }

  if (allWarnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of allWarnings) console.warn(`  ! ${w}`);
  }

  writeJson(outputFile, allEntries);
  console.log(`\nCompiled ${allEntries.length} prompt(s)`);
}

async function compileFlows(): Promise<void> {
  const flowDirs = [
    ...discoverFeatureDirs('flows'),
    resolve('src/shared/flows'),
  ].filter(d => fs.existsSync(d));

  const actionsJson = resolve('dist/compiled-actions.json');
  const promptsJson = resolve('dist/compiled-prompts.json');
  const outputFile = resolve('dist/compiled-flows.json');

  let merged: FlowDSL = {};
  let rootFlowName: string | null = null;
  let totalLoaded = 0;

  for (const dir of flowDirs) {
    const result = await loadFlowsFromDir(dir);
    for (const [name, value] of Object.entries(result.merged)) {
      if (merged[name]) {
        throw new Error(`Duplicate flow name "${name}" across directories`);
      }
      merged[name] = value;
    }
    if (result.rootFlowName) {
      if (rootFlowName) {
        throw new Error(`Multiple root flows: "${rootFlowName}" and "${result.rootFlowName}"`);
      }
      rootFlowName = result.rootFlowName;
    }
    totalLoaded += result.loaded;
  }

  if (!totalLoaded) {
    writeJson(outputFile, {});
    return;
  }

  const actionLabels = JSON.parse(fs.readFileSync(actionsJson, 'utf-8')).map((a: any) => a.label);
  const promptLabels = JSON.parse(fs.readFileSync(promptsJson, 'utf-8')).map((p: any) => p.label);

  const validation = validateFlows(merged, actionLabels, promptLabels);
  if (!validation.valid) {
    const errMessages = validation.errors.map(e => `  ${e.path}: ${e.message}`);
    throw new Error(`Flow validation errors:\n${errMessages.join('\n')}`);
  }

  writeJson(outputFile, hashFlows(merged));
  console.log(`Compiled ${Object.keys(merged).length} flow(s)`);
}

function compileLibrary(): void {
  const libraryDir = resolve('src/features/library/library-docs');
  const outputFile = resolve('dist/compiled-library.json');
  const result = compileLibraryFromDir(libraryDir);
  writeJson(outputFile, result);
  copyLibraryMedia(libraryDir, resolve('dist'));
  console.log(`Compiled library (${result.items.length} top-level items)`);
}

function compileNotes(): void {
  const notesDir = resolve('src/shared/notes');
  const outputFile = resolve('dist/compiled-notes.json');
  const result = compileNotesFromDir(notesDir);
  writeJson(outputFile, result);
  copyNotesMedia(notesDir, resolve('dist'));
  console.log(`Compiled ${result.notes.length} note(s)`);
}

async function compileSettings(): Promise<void> {
  const outputFile = resolve('dist/compiled-settings.json');
  const baseSettingsFile = resolve('src/base-settings.ts');
  let settings = await loadSettingsFromFile(baseSettingsFile);

  const featuresRoot = resolve('src/features');
  if (fs.existsSync(featuresRoot)) {
    const { pathToFileURL } = await import('url');
    const featureDirs = fs.readdirSync(featuresRoot, { withFileTypes: true })
      .filter(d => d.isDirectory());
    for (const dir of featureDirs) {
      const configPath = path.join(featuresRoot, dir.name, 'pack.config.ts');
      if (!fs.existsSync(configPath)) continue;
      const mod = await import(pathToFileURL(configPath).href);
      const config = mod.default ?? mod;
      if (!config.settings) continue;
      const settingsPath = path.resolve(path.dirname(configPath), config.settings);
      if (fs.existsSync(settingsPath)) {
        const featureSettings = await loadSettingsFromFile(settingsPath);
        settings = deepMerge(settings, featureSettings);
      }
    }
  }

  writeJson(outputFile, settings);
  console.log('Compiled settings');
}

function compileFaq(): void {
  const faqsDir = resolve('src/shared/faqs');
  const outputFile = resolve('dist/compiled-faq.json');
  const result = compileFaqFromDir(faqsDir);
  writeJson(outputFile, result);
  console.log(`Compiled ${result.length} FAQ(s)`);
}

const target = process.argv[2];

if (target === 'actions') {
  compileActions().catch(err => {
    console.error('Action compilation failed:', err);
    process.exit(1);
  });
} else if (target === 'prompts') {
  compilePrompts().catch(err => {
    console.error('Prompt compilation failed:', err);
    process.exit(1);
  });
} else if (target === 'flows') {
  compileFlows().catch(err => {
    console.error('Flow compilation failed:', err);
    process.exit(1);
  });
} else if (target === 'library') {
  compileLibrary();
} else if (target === 'notes') {
  compileNotes();
} else if (target === 'settings') {
  compileSettings().catch(err => {
    console.error('Settings compilation failed:', err);
    process.exit(1);
  });
} else if (target === 'faq') {
  compileFaq();
} else if (target === 'all') {
  compilePack({
    featuresDir: resolve('src/features'),
    sharedDir: resolve('src/shared'),
    outputDir: resolve('dist'),
    baseSettingsFile: resolve('src/base-settings.ts'),
  }).catch(err => {
    console.error('Pack compilation failed:', err);
    process.exit(1);
  });
} else {
  console.error(`Usage: tsx compile.ts <${['actions', 'prompts', 'flows', 'library', 'notes', 'settings', 'faq', 'all'].join('|')}>`);
  process.exit(1);
}
