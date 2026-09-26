import * as fs from 'node:fs';
import * as path from 'node:path';
import { cliVersion } from '../utils';
import { scaffoldUnitTestSetup } from './init';

// The Playwright version @abuddy/testing is tested with
const PLAYWRIGHT_RANGE = '^1.54.1';

const PLAYWRIGHT_CONFIG = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  outputDir: 'tests/results',
});
`;

function sampleTest(pluginId: string | undefined): string {
  const waitLine = pluginId
    ? `  await app.waitForPlugin('${pluginId}');\n  await app.navigate('${pluginId}');\n`
    : '  // await app.waitForPlugin(\'your-plugin-id\');\n  // await app.navigate(\'your-plugin-id\');\n';

  return `import { test, expect } from '@abuddy/testing';

test('pack loads and renders', async ({ app }) => {
${waitLine}  await app.screenshot('pack-default');
});

test('app reaches connected state', async ({ app }) => {
  const state = await app.getState();
  expect(state).toEqual({ running: 'connected' });
});
`;
}

export async function initTests(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  const manifestPath = path.join(cwd, 'abuddy.json');

  if (!fs.existsSync(manifestPath)) {
    console.error('No abuddy.json found in current directory. Run this from your pack root.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const feat = (manifest.features ?? []).find((f: any) => f.plugin);
  const pluginId: string | undefined = feat?.plugin?.id ?? feat?.id;

  const configPath = path.join(cwd, 'playwright.config.ts');
  if (fs.existsSync(configPath)) {
    console.log('playwright.config.ts already exists, skipping');
  } else {
    fs.writeFileSync(configPath, PLAYWRIGHT_CONFIG);
    console.log('Created playwright.config.ts');
  }

  const testDir = path.join(cwd, 'tests', 'e2e');
  fs.mkdirSync(testDir, { recursive: true });

  const smokeFile = path.join(testDir, 'smoke.spec.ts');
  if (fs.existsSync(smokeFile)) {
    console.log('tests/e2e/smoke.spec.ts already exists, skipping');
  } else {
    fs.writeFileSync(smokeFile, sampleTest(pluginId));
    console.log('Created tests/e2e/smoke.spec.ts');
  }

  const gitignorePath = path.join(cwd, '.gitignore');
  const gitignoreEntries = ['tests/screenshots/', 'tests/results/'];
  if (fs.existsSync(gitignorePath)) {
    const existing = fs.readFileSync(gitignorePath, 'utf-8');
    const toAdd = gitignoreEntries.filter(e => !existing.includes(e));
    if (toAdd.length > 0) {
      fs.appendFileSync(gitignorePath, '\n# Test output\n' + toAdd.join('\n') + '\n');
      console.log('Updated .gitignore with test output paths');
    }
  } else {
    fs.writeFileSync(gitignorePath, '# Test output\n' + gitignoreEntries.join('\n') + '\n');
    console.log('Created .gitignore with test output paths');
  }

  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const wanted: Record<string, string> = { '@abuddy/testing': `^${cliVersion()}`, '@playwright/test': PLAYWRIGHT_RANGE };
    const missing = Object.keys(wanted).filter(name => !pkg.devDependencies?.[name] && !pkg.dependencies?.[name]);
    if (missing.length > 0) {
      pkg.devDependencies = { ...pkg.devDependencies, ...Object.fromEntries(missing.map(name => [name, wanted[name]])) };
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`Added ${missing.join(', ')} to devDependencies. Run: npm install`);
    }
  }

  // Both halves, because a pack has both: `abuddy test` needs an app and `abuddy test --contract` does not.
  // Scaffolding only the Playwright half left an author with no way to check compiled output without one.
  if (!fs.existsSync(path.join(cwd, 'tests', 'setup.ts'))) {
    const { keptConfig, addedDependencies, upgrades } = scaffoldUnitTestSetup(cwd);
    console.log('Created tests/setup.ts for the contract half (@abuddy/testing/harness)');
    if (keptConfig) {
      console.log(`  ${keptConfig} already exists: give its test options isolatedDataDir()'s env and globalSetup, and setupFiles: [...dataDir.setupFiles, './tests/setup.ts'] (@abuddy/testing/vitest)`);
    } else {
      console.log('Created vitest.config.ts');
    }
    if (addedDependencies.length > 0) console.log(`  Added ${addedDependencies.join(', ')} to devDependencies. Run: npm install`);
    if (upgrades.length > 0) {
      console.log(`  The harness can't run on the pack's ${upgrades.map(({ name, reason }) => `${name} (${reason})`).join(', ')}.`);
      console.log(`  Upgrade: npm install -D ${upgrades.map(({ name, range }) => `${name}@"${range}"`).join(' ')}`);
    }
  }

  console.log('\nTo run tests:');
  console.log('  abuddy test --contract   # the pack\'s vitest, no app');
  console.log('  abuddy test              # Playwright, in AgentBuddy');
}
