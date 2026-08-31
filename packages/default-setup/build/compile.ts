import * as fs from 'fs';
import * as path from 'path';
import { compileSourceDir } from './compile-utils';
import { loadFlowsFromDir, validateFlows, hashFlows } from './compile-flows';
import { compileLibraryFromDir, copyLibraryMedia } from './compile-library';
import { compileNotesFromDir, copyNotesMedia } from './compile-notes';
import { loadSettingsFromFile, deepMerge } from './compile-settings';
import { compileFaqFromDir } from './compile-faq';
import { seedFile, compilePack } from '@abuddy/sdk/build';
import { registerDefaultCompilers } from './seed-compilers';

const baseDir = path.resolve(import.meta.dirname, '..');
const configDir = path.join(baseDir, 'src/seeds');

function resolve(relative: string): string {
  return path.join(baseDir, relative);
}

function configPath(relative: string): string {
  return path.join(configDir, relative);
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// ============================================================================
// Individual compilation targets (backward compatible, compile from seeds/)
// ============================================================================

async function compileActions(): Promise<void> {
  const dir = configPath('actions');
  const outputFile = resolve(`dist/${seedFile('actions')}`);

  console.log(`Compiling actions from: ${dir}`);
  const result = await compileSourceDir(dir, {
    functionName: 'action',
    isAsync: true,
    fields: { metaInput: 'input', fnBody: 'actionFn', output: 'output' },
  });
  for (const entry of result.entries) console.log(`  + ${entry.label}`);

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of result.warnings) console.warn(`  ! ${w}`);
  }

  writeJson(outputFile, result.entries);
  console.log(`\nCompiled ${result.entries.length} action(s)`);
}

async function compilePrompts(): Promise<void> {
  const dir = configPath('prompts');
  const outputFile = resolve(`dist/${seedFile('prompts')}`);

  console.log(`Compiling prompts from: ${dir}`);
  const result = await compileSourceDir(dir, {
    functionName: 'template',
    isAsync: false,
    fields: { metaInput: 'inputs', fnBody: 'templateFn', output: 'outputSchema' },
  });
  for (const entry of result.entries) console.log(`  + ${entry.label}`);

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of result.warnings) console.warn(`  ! ${w}`);
  }

  writeJson(outputFile, result.entries);
  console.log(`\nCompiled ${result.entries.length} prompt(s)`);
}

async function compileFlows(): Promise<void> {
  const dir = configPath('flows');
  const actionsJson = resolve(`dist/${seedFile('actions')}`);
  const promptsJson = resolve(`dist/${seedFile('prompts')}`);
  const outputFile = resolve(`dist/${seedFile('flows')}`);

  const result = await loadFlowsFromDir(dir);
  const merged = result.merged;

  if (!result.loaded) {
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
  const dir = configPath('library');
  const outputFile = resolve(`dist/${seedFile('library')}`);
  const result = compileLibraryFromDir(dir);
  writeJson(outputFile, result);
  copyLibraryMedia(dir, resolve('dist'));
  console.log(`Compiled library (${result.items.length} top-level items)`);
}

function compileNotes(): void {
  const dir = configPath('notes');
  const outputFile = resolve(`dist/${seedFile('notes')}`);
  const result = compileNotesFromDir(dir);
  writeJson(outputFile, result);
  copyNotesMedia(dir, resolve('dist'));
  console.log(`Compiled ${result.notes.length} note(s)`);
}

async function compileSettings(): Promise<void> {
  const outputFile = resolve(`dist/${seedFile('settings')}`);
  const baseSettingsFile = configPath('default-settings.ts');
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
  const dir = configPath('faqs');
  const outputFile = resolve(`dist/${seedFile('faq')}`);
  const result = compileFaqFromDir(dir);
  writeJson(outputFile, result);
  console.log(`Compiled ${result.length} FAQ(s)`);
}

// ============================================================================
// Orchestrated compilation (uses SDK compiler framework)
// ============================================================================

async function compileAll(): Promise<void> {
  registerDefaultCompilers();

  await compilePack({
    packDir: baseDir,
    featuresDir: resolve('src/features'),
    outputDir: resolve('dist'),
    baseSettingsFile: configPath('default-settings.ts'),
  });
}

// ============================================================================
// CLI dispatch
// ============================================================================

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
  compileAll().catch(err => {
    console.error('Pack compilation failed:', err);
    process.exit(1);
  });
} else {
  console.error(`Usage: tsx compile.ts <${['actions', 'prompts', 'flows', 'library', 'notes', 'settings', 'faq', 'all'].join('|')}>`);
  process.exit(1);
}
