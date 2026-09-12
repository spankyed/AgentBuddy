import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureSdkLink } from '../utils';

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
    const hasPlaywright = pkg.devDependencies?.['@playwright/test'] || pkg.dependencies?.['@playwright/test'];
    if (!hasPlaywright) {
      console.log('\nNext step: install Playwright');
      console.log('  npm i -D @playwright/test');
    }
  }

  ensureSdkLink(cwd);
  console.log('Linked @abuddy/sdk into node_modules');

  if (!process.env.ABUDDY_ROOT) {
    console.log('\nPrerequisite: a local clone of the AgentBuddy monorepo (installed + built).');
    console.log('Set ABUDDY_ROOT to point to it:');
    console.log('  export ABUDDY_ROOT=/path/to/AgentBuddy');
  }

  console.log('\nTo run tests:');
  console.log('  abuddy test');
}
