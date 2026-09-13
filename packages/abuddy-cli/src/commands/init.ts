import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { generate, resolveDeps } from './generate';
import { generateEntries } from './generate-entries';
import { cliVersion, readManifest, sdkVersion } from '../utils';

const MANIFEST_TEMPLATE = (name: string) => {
  const pascalName = name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
  return JSON.stringify({
    $schema: './node_modules/@abuddy/sdk/abuddy.schema.json',
    id: name,
    name: name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
    version: '0.1.0',
    hostVersion: '>=0.3.0',
    entities: { [pascalName]: pascalName },
    relKinds: {},
    features: [],
    dependencies: {},
    permissions: [],
    steps: { register: 'src/extensions/steps/register.ts', build: 'src/extensions/steps/build.ts', definitions: [] },
    boot: {
      seed: {
        actions: 'src/seeds/actions',
        flows: 'src/seeds/flows',
      },
    },
  }, null, 2);
};

const TSCONFIG_TEMPLATE = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'esnext',
    moduleResolution: 'bundler',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
    types: ['node'],
    // Mirrors package.json "imports": TypeScript doesn't add extensions to subpath import targets
    paths: {
      '#generated/*': ['./src/__generated__/*'],
    },
  },
  include: ['src/**/*.ts', 'tests/**/*.ts', '.abuddy/generated/**/*.ts', '.abuddy/deps/**/*.d.ts'],
}, null, 2);

const ENV_DTS_TEMPLATE = `// Plain \`tsc\` can't read .vue files, so single-file components resolve to a generic
// component here. Checking inside SFCs needs vue-tsc.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>;
  export default component;
}
`;

const PACKAGE_JSON_TEMPLATE = (name: string) => JSON.stringify({
  name: `@abuddy-pack/${name}`,
  version: '0.1.0',
  private: true,
  type: 'module',
  imports: {
    '#generated/*': './src/__generated__/*',
  },
  scripts: {
    prepare: 'abuddy generate-entries',
    generate: 'abuddy generate',
    build: 'abuddy build',
    validate: 'abuddy validate',
    dev: 'abuddy dev',
    test: 'vitest run',
    typecheck: 'tsc --noEmit',
  },
  dependencies: {
    '@abuddy/sdk': `^${sdkVersion() ?? cliVersion()}`,
  },
  devDependencies: {
    // Pinned per project: a global, Homebrew or app-bundled `abuddy` hands off to this one
    '@abuddy/cli': `^${cliVersion()}`,
    typescript: '^5.8.3',
    vitest: '^3.2.1',
  },
}, null, 2);

const VITEST_CONFIG_TEMPLATE = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // tests/e2e holds Playwright specs (abuddy init-tests), run with \`abuddy test\`
    include: ['tests/unit/**/*.spec.ts'],
  },
});
`;

// Build-time facets only (no runtime handlers or FE): bundled to build/steps.build.mjs so packs
// that depend on this one validate their flows with this pack's step code
const STEPS_BUILD_TEMPLATE = `import type { StepDefinition } from '@abuddy/sdk/steps';

export const steps: StepDefinition[] = [
];
`;

const STEPS_REGISTER_TEMPLATE = `import type { StepDefinition } from '@abuddy/sdk/steps';

export const steps: StepDefinition[] = [
  // Add your step definitions here
];
`;

const EXAMPLE_TEST_TEMPLATE = (name: string) => `import { describe, it, expect } from 'vitest';

describe('${name}', () => {
  it('should have a valid manifest', async () => {
    const manifest = await import('../../abuddy.json', { with: { type: 'json' } });
    expect(manifest.default.id).toBe('${name}');
  });
});
`;

// Publishes the GitHub release when `abuddy release` pushes a v* tag
export const RELEASE_WORKFLOW_TEMPLATE = `name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write
  id-token: write
  attestations: write

jobs:
  release:
    # AgentBuddy Beta builds are macOS arm64; the build reads built-in packs (e.g. default-setup) from one
    runs-on: macos-14
    env:
      ABUDDY_APP: beta
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 23
          cache: npm

      - run: npm ci

      - name: Tag matches abuddy.json version
        run: test "v$(node -p "require('./abuddy.json').version")" = "$GITHUB_REF_NAME"

      - run: npx abuddy build --release

      - run: npx abuddy pack --out .abuddy/release

      - uses: actions/attest-build-provenance@v2
        with:
          subject-path: .abuddy/release/*.tgz

      - run: npx abuddy release publish --dir .abuddy/release
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;

const GITIGNORE_TEMPLATE = `node_modules/
dist/
.abuddy/
src/__generated__/
*.tgz
`;

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise(resolve => {
    rl.question(`${question}${suffix}: `, answer => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

export async function init(args: string[]) {
  const name = args[0] || await prompt('Pack name', 'my-pack');

  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error('Pack name must be lowercase alphanumeric with hyphens (e.g. "my-pack")');
  }

  const dir = path.resolve(name);
  if (fs.existsSync(dir)) {
    throw new Error(`Directory "${name}" already exists`);
  }

  fs.mkdirSync(path.join(dir, 'src', 'seeds', 'actions'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'seeds', 'flows'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'extensions', 'steps'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests', 'unit'), { recursive: true });

  fs.writeFileSync(path.join(dir, 'abuddy.json'), MANIFEST_TEMPLATE(name));
  fs.writeFileSync(path.join(dir, 'package.json'), PACKAGE_JSON_TEMPLATE(name));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG_TEMPLATE);
  fs.writeFileSync(path.join(dir, '.gitignore'), GITIGNORE_TEMPLATE);
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'release.yml'), RELEASE_WORKFLOW_TEMPLATE);
  fs.writeFileSync(path.join(dir, 'src', 'env.d.ts'), ENV_DTS_TEMPLATE);
  fs.writeFileSync(
    path.join(dir, 'vitest.config.ts'),
    VITEST_CONFIG_TEMPLATE,
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'extensions', 'steps', 'register.ts'),
    STEPS_REGISTER_TEMPLATE,
  );
  fs.writeFileSync(path.join(dir, 'src', 'extensions', 'steps', 'build.ts'), STEPS_BUILD_TEMPLATE);
  fs.writeFileSync(
    path.join(dir, 'tests', 'unit', `${name}.spec.ts`),
    EXAMPLE_TEST_TEMPLATE(name),
  );

  const initManifest = readManifest(dir);
  const { depTypes, depSnapshots } = await resolveDeps(dir, initManifest.dependencies);
  await generate([], dir, depSnapshots);
  await generateEntries([], dir, depTypes, depSnapshots);

  console.log(`\nCreated pack "${name}" at ./${name}/`);
  console.log(`\nImport types in your seed code:`);
  console.log(`  import type { ActionMeta } from '@abuddy/sdk/build';`);
  console.log(`  import type { Services, Z } from '#generated/services';`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${name}`);
  console.log(`  npm install`);
  console.log(`  abuddy add feature <name>`);
  console.log(`  abuddy build`);
}
