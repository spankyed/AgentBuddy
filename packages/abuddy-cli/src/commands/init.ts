import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import semver from 'semver';
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
        // Rows of the pack's own entity type, from markdown, with the format below: no seeding code needed
        [SEED_ROWS_KEY]: { path: `src/seeds/${SEED_ROWS_KEY}`, format: SEED_ROWS_KEY },
      },
    },
    seedFormats: {
      [SEED_ROWS_KEY]: {
        format: 'markdown-tree',
        entity: pascalName,
        identity: ['title'],
        fields: {
          title: { from: 'frontmatter.title', default: 'filename', type: 'string' },
          content: { from: 'body' },
        },
      },
    },
  }, null, 2);
};

/** The scaffold's example seed entry key */
const SEED_ROWS_KEY = 'examples';

const EXAMPLE_SEED_ROW_TEMPLATE = `---
title: Hello
---
Seeded from src/seeds/${SEED_ROWS_KEY}/hello.md by the "${SEED_ROWS_KEY}" seed entry and format in abuddy.json.
`;

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
    // A pack linked to an AgentBuddy checkout typechecks its @abuddy/* packages from source, like
    // abuddy build does; installed packages don't use the condition. Their sources name .ts files.
    customConditions: ['@abuddy/source'],
    allowImportingTsExtensions: true,
    // Mirrors package.json "imports": TypeScript doesn't add extensions to subpath import targets
    paths: {
      '#generated/*': ['./src/__generated__/*'],
    },
  },
  include: ['src/**/*.ts', 'tests/**/*.ts', '.abuddy/generated/**/*.ts', '.abuddy/deps/**/*.d.ts'],
}, null, 2);

const ENV_DTS_TEMPLATE = `// Plain \`tsc\` can't read .vue files, so the pack's own single-file components resolve to a
// generic component here. @abuddy/ui components ship declarations and keep their prop types.
// Checking inside SFCs needs vue-tsc.
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
    '@abuddy/sdk': SDK_RANGE(),
  },
  devDependencies: {
    // Pinned per project: a global, Homebrew or app-bundled `abuddy` hands off to this one
    '@abuddy/cli': `^${cliVersion()}`,
    // Unit tests run the pack's seeds and repositories in memory (@abuddy/testing/harness)
    ...UNIT_TEST_DEV_DEPENDENCIES(SDK_RANGE()),
    // The scaffold's tsconfig uses Node types
    '@types/node': '^22.15.17',
    typescript: '^5.8.3',
  },
}, null, 2);

const VITEST_CONFIG_TEMPLATE = `import { defineConfig } from 'vitest/config';
import { isolatedDataDir, sourceConditions } from '@abuddy/testing/vitest';

// A pack linked to an AgentBuddy checkout resolves its @abuddy/* packages to source; installed packages don't.
// Vitest adds its default conditions to these.
const conditions = sourceConditions(import.meta.dirname);
// A throwaway data dir per run (media, stores), one subdir per worker
const dataDir = isolatedDataDir();

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    globals: true,
    // tests/e2e holds Playwright specs (abuddy init-tests), run with \`abuddy test\`
    include: ['tests/unit/**/*.spec.ts'],
    env: dataDir.env,
    globalSetup: dataDir.globalSetup,
    setupFiles: [...dataDir.setupFiles, './tests/setup.ts'],
  },
});
`;

// Unit tests run against an in-memory EARS with the pack's repositories, seed hooks, seeders, systems,
// services and steps, and its dependencies' runtimes (cached by abuddy build)
const TEST_SETUP_TEMPLATE = `import '#generated/seeders';
import { seedRuntime } from '#generated/seed-runtime';
import { registration } from '#generated/pack-entry';
import { setupPackTests } from '@abuddy/testing/harness';

await setupPackTests({ seedRuntime, registration });
`;

/** The @abuddy/sdk range the scaffold declares: the SDK this CLI runs against */
const SDK_RANGE = () => `^${sdkVersion() ?? cliVersion()}`;

/** The first vitest release the harness runs on (its peer range) */
const VITEST_FLOOR = '3.0.0';

/**
 * What the unit test setup needs installed, for a pack on `sdkRange`. @abuddy/testing is released with @abuddy/sdk at
 * the same version and takes it as a peer dependency (^<version>, one minor before 1.0), so it gets the pack's SDK range.
 */
const UNIT_TEST_DEV_DEPENDENCIES = (sdkRange: string) => ({ '@abuddy/testing': sdkRange, vitest: '^3.2.1' });

/** The files vitest loads its config from, in the order it looks for them */
const VITEST_CONFIG_FILES = ['vitest.config', 'vite.config'].flatMap((name) => ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((ext) => `${name}.${ext}`));

export interface UnitTestSetup {
  /** Files written */
  created: string[];
  /** The config vitest already loaded in the pack (vitest.config.* or vite.config.*), kept: it may not load tests/setup.ts */
  keptConfig?: string;
  /** devDependencies added to package.json */
  addedDependencies: string[];
  /** Packages the pack already has that the harness can't run on, with the range to upgrade to and why */
  upgrades: Array<{ name: string; range: string; reason: string }>;
}

/** The pack's @abuddy/sdk range, as npm resolves @abuddy/testing's peer against it */
function packSdkRange(pkg: PackageJson): string {
  const declared = pkg.dependencies?.['@abuddy/sdk'] ?? pkg.devDependencies?.['@abuddy/sdk'] ?? pkg.peerDependencies?.['@abuddy/sdk'];
  return declared && semver.validRange(declared) ? declared : SDK_RANGE();
}

interface PackageJson {
  version?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** A package installed where the pack's Node resolution finds it (node_modules at or above the pack) */
function installedPackage(root: string, name: string): PackageJson | undefined {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const file = path.join(dir, 'node_modules', name, 'package.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** Why the pack's own `name` (declared as `declared`, installed or not) can't run the harness, if it can't */
function outdatedReason(root: string, name: string, declared: string, wanted: string): string | undefined {
  const installed = installedPackage(root, name);
  if (name === '@abuddy/testing') {
    if (installed && !installed.exports?.['./harness']) return `the installed ${installed.version ?? 'version'} has no @abuddy/testing/harness`;
    if (semver.validRange(declared) && !semver.intersects(declared, wanted)) return `${declared} doesn't match the pack's @abuddy/sdk ${wanted}`;
  } else {
    if (installed?.version && semver.valid(installed.version) && semver.lt(installed.version, VITEST_FLOOR)) return `the installed ${installed.version} is before ${VITEST_FLOOR}`;
    if (semver.validRange(declared) && !semver.intersects(declared, `>=${VITEST_FLOOR}`)) return `${declared} is before ${VITEST_FLOOR}`;
  }
  return undefined;
}

/**
 * Writes the unit test setup a pack lacks: vitest.config.ts, tests/setup.ts (the harness) and their devDependencies.
 * Keeps files that exist, and reports dependencies the pack has that the harness can't run on.
 */
export function scaffoldUnitTestSetup(root: string): UnitTestSetup {
  const created: string[] = [];
  const keptConfig = VITEST_CONFIG_FILES.find((file) => fs.existsSync(path.join(root, file)));
  if (!keptConfig) {
    const configPath = path.join(root, 'vitest.config.ts');
    fs.writeFileSync(configPath, VITEST_CONFIG_TEMPLATE);
    created.push(configPath);
  }
  const setupPath = path.join(root, 'tests', 'setup.ts');
  if (!fs.existsSync(setupPath)) {
    fs.mkdirSync(path.dirname(setupPath), { recursive: true });
    fs.writeFileSync(setupPath, TEST_SETUP_TEMPLATE);
    created.push(setupPath);
  }
  const addedDependencies: string[] = [];
  const upgrades: UnitTestSetup['upgrades'] = [];
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJson;
    const sdkRange = packSdkRange(pkg);
    for (const [name, range] of Object.entries(UNIT_TEST_DEV_DEPENDENCIES(sdkRange))) {
      const declared = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
      if (declared) {
        const reason = outdatedReason(root, name, declared, sdkRange);
        if (reason) upgrades.push({ name, range, reason });
        continue;
      }
      pkg.devDependencies = { ...pkg.devDependencies, [name]: range };
      addedDependencies.push(name);
    }
    if (addedDependencies.length > 0) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
  return { created, keptConfig, addedDependencies, upgrades };
}

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

const EXAMPLE_TEST_TEMPLATE = (name: string) => {
  const pascalName = name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
  return `import { describe, it, expect } from 'vitest';
import { seedPack } from '@abuddy/testing/harness';
import { EARS, findAll } from '#generated/ears';

describe('${name}', () => {
  it('should have a valid manifest', async () => {
    const manifest = await import('../../abuddy.json', { with: { type: 'json' } });
    expect(manifest.default.id).toBe('${name}');
  });

  it('seeds the examples entry', async () => {
    expect(await seedPack({ keys: ['${SEED_ROWS_KEY}'] })).toEqual({ ${SEED_ROWS_KEY}: { created: 1, updated: 0, skipped: 0 } });
    expect(findAll(EARS.Entity.${pascalName}).map((row) => row.title)).toEqual(['Hello']);
  });
});
`;
};

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
  fs.mkdirSync(path.join(dir, 'src', 'seeds', SEED_ROWS_KEY), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'extensions', 'steps'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests', 'unit'), { recursive: true });

  fs.writeFileSync(path.join(dir, 'abuddy.json'), MANIFEST_TEMPLATE(name));
  fs.writeFileSync(path.join(dir, 'src', 'seeds', SEED_ROWS_KEY, 'hello.md'), EXAMPLE_SEED_ROW_TEMPLATE);
  fs.writeFileSync(path.join(dir, 'package.json'), PACKAGE_JSON_TEMPLATE(name));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG_TEMPLATE);
  fs.writeFileSync(path.join(dir, '.gitignore'), GITIGNORE_TEMPLATE);
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'release.yml'), RELEASE_WORKFLOW_TEMPLATE);
  fs.writeFileSync(path.join(dir, 'src', 'env.d.ts'), ENV_DTS_TEMPLATE);
  fs.writeFileSync(
    path.join(dir, 'src', 'extensions', 'steps', 'register.ts'),
    STEPS_REGISTER_TEMPLATE,
  );
  fs.writeFileSync(path.join(dir, 'src', 'extensions', 'steps', 'build.ts'), STEPS_BUILD_TEMPLATE);
  scaffoldUnitTestSetup(dir);
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
