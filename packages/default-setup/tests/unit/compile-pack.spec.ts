import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { compilePack } from '../../build/compile-pack';
import { seedFile } from '@abuddy/sdk/build';

const ROOT = path.resolve(__dirname, '..', '..');
const FEATURES_DIR = path.join(ROOT, 'src', 'features');
const SHARED_DIR = path.join(ROOT, 'src', 'shared');
const BASE_SETTINGS = path.join(ROOT, 'src', 'default-settings.ts');

let outputDir: string;

beforeEach(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-pack-'));
});

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true });
});

describe('compilePack', () => {
  it('produces all 7 expected output files', async () => {
    await compilePack({
      featuresDir: FEATURES_DIR,
      sharedDir: SHARED_DIR,
      outputDir,
      baseSettingsFile: fs.existsSync(BASE_SETTINGS) ? BASE_SETTINGS : undefined,
    });

    const expected = [
      seedFile('actions'),
      seedFile('prompts'),
      seedFile('flows'),
      seedFile('library'),
      seedFile('notes'),
      seedFile('faq'),
      seedFile('settings'),
    ];

    for (const file of expected) {
      expect(fs.existsSync(path.join(outputDir, file))).toBe(true);
    }
  });

  it('actions artifact is an array with label and actionFn fields', async () => {
    await compilePack({
      featuresDir: FEATURES_DIR,
      sharedDir: SHARED_DIR,
      outputDir,
    });

    const actions = JSON.parse(fs.readFileSync(path.join(outputDir, seedFile('actions')), 'utf-8'));
    expect(Array.isArray(actions)).toBe(true);
    if (actions.length > 0) {
      expect(actions[0]).toHaveProperty('label');
      expect(actions[0]).toHaveProperty('actionFn');
      expect(actions[0]).toHaveProperty('sourceHash');
    }
  });

  it('prompts artifact is an array with label and templateFn fields', async () => {
    await compilePack({
      featuresDir: FEATURES_DIR,
      sharedDir: SHARED_DIR,
      outputDir,
    });

    const prompts = JSON.parse(fs.readFileSync(path.join(outputDir, seedFile('prompts')), 'utf-8'));
    expect(Array.isArray(prompts)).toBe(true);
    if (prompts.length > 0) {
      expect(prompts[0]).toHaveProperty('label');
      expect(prompts[0]).toHaveProperty('templateFn');
      expect(prompts[0]).toHaveProperty('sourceHash');
    }
  });

  it('flows artifact is an object with flow name keys', async () => {
    await compilePack({
      featuresDir: FEATURES_DIR,
      sharedDir: SHARED_DIR,
      outputDir,
    });

    const flows = JSON.parse(fs.readFileSync(path.join(outputDir, seedFile('flows')), 'utf-8'));
    expect(typeof flows).toBe('object');
    expect(Array.isArray(flows)).toBe(false);

    const flowNames = Object.keys(flows);
    if (flowNames.length > 0) {
      const firstFlow = flows[flowNames[0]];
      const tracks = Array.isArray(firstFlow) ? firstFlow : firstFlow.tracks;
      expect(Array.isArray(tracks)).toBe(true);
    }
  });

  it('settings artifact is a non-empty object', async () => {
    await compilePack({
      featuresDir: FEATURES_DIR,
      sharedDir: SHARED_DIR,
      outputDir,
      baseSettingsFile: fs.existsSync(BASE_SETTINGS) ? BASE_SETTINGS : undefined,
    });

    const settings = JSON.parse(fs.readFileSync(path.join(outputDir, seedFile('settings')), 'utf-8'));
    expect(typeof settings).toBe('object');
    expect(Object.keys(settings).length).toBeGreaterThan(0);
  });

  it('returns accurate counts in CompilePackResult', async () => {
    const result = await compilePack({
      featuresDir: FEATURES_DIR,
      sharedDir: SHARED_DIR,
      outputDir,
    });

    expect(result.actions).toBeGreaterThanOrEqual(0);
    expect(result.prompts).toBeGreaterThanOrEqual(0);
    expect(result.flows).toBeGreaterThanOrEqual(0);
    expect(typeof result.warnings).toBe('object');
    expect(Array.isArray(result.warnings)).toBe(true);

    // Cross-check counts against output
    const actions = JSON.parse(fs.readFileSync(path.join(outputDir, seedFile('actions')), 'utf-8'));
    const prompts = JSON.parse(fs.readFileSync(path.join(outputDir, seedFile('prompts')), 'utf-8'));
    const flows = JSON.parse(fs.readFileSync(path.join(outputDir, seedFile('flows')), 'utf-8'));

    expect(result.actions).toBe(actions.length);
    expect(result.prompts).toBe(prompts.length);
    expect(result.flows).toBe(Object.keys(flows).length);
  });

  it('no duplicate action labels in compiled output', async () => {
    await compilePack({
      featuresDir: FEATURES_DIR,
      sharedDir: SHARED_DIR,
      outputDir,
    });

    const actions = JSON.parse(fs.readFileSync(path.join(outputDir, seedFile('actions')), 'utf-8'));
    const labels = actions.map((a: any) => a.label);
    const unique = new Set(labels);
    expect(labels.length).toBe(unique.size);
  });

  it('no duplicate prompt labels in compiled output', async () => {
    await compilePack({
      featuresDir: FEATURES_DIR,
      sharedDir: SHARED_DIR,
      outputDir,
    });

    const prompts = JSON.parse(fs.readFileSync(path.join(outputDir, seedFile('prompts')), 'utf-8'));
    const labels = prompts.map((p: any) => p.label);
    const unique = new Set(labels);
    expect(labels.length).toBe(unique.size);
  });

  it('is idempotent — two runs produce identical JSON', async () => {
    const outputDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-pack-2-'));

    const opts = {
      featuresDir: FEATURES_DIR,
      sharedDir: SHARED_DIR,
      baseSettingsFile: fs.existsSync(BASE_SETTINGS) ? BASE_SETTINGS : undefined,
    };

    await compilePack({ ...opts, outputDir });
    await compilePack({ ...opts, outputDir: outputDir2 });

    const files = [seedFile('actions'), seedFile('prompts'), seedFile('flows'), seedFile('settings')];
    for (const file of files) {
      const a = fs.readFileSync(path.join(outputDir, file), 'utf-8');
      const b = fs.readFileSync(path.join(outputDir2, file), 'utf-8');
      expect(a).toBe(b);
    }

    fs.rmSync(outputDir2, { recursive: true, force: true });
  });
});
