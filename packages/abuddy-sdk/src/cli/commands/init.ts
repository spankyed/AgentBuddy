import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { generate } from './generate';
import { generateEntries } from './generate-entries';

const MANIFEST_TEMPLATE = (name: string) => {
  const pascalName = name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
  return JSON.stringify({
    id: name,
    name: name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
    version: '0.1.0',
    hostVersion: '>=0.3.0',
    entities: { [pascalName]: pascalName },
    relKinds: {},
    fe: { entry: 'dist/fe.js', styles: 'dist/fe.css' },
    features: [],
    dependencies: { 'default-setup': '*' },
    permissions: [],
    steps: 'src/extensions/steps/register.ts',
    boot: {
      seed: {
        actions: 'src/seeds/actions',
        flows: 'src/seeds/flows',
      },
    },
  }, null, 2);
};

const FEATURE_CONFIG_TEMPLATE = (name: string) => `import type { FeatureConfig } from '@abuddy/sdk/build';

export default {
  name: '${name}',
  settings: './settings.ts',
} satisfies FeatureConfig;
`;

const SETTINGS_TEMPLATE = (id: string) => `export default {
  plugins: {
    _meta: { visibility: { ${id}: true } },
    ${id}: {}
  }
}
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
  },
  include: ['src/**/*.ts', 'tests/**/*.ts', '.abuddy/generated/**/*.ts', '.abuddy/deps/**/*.d.ts'],
}, null, 2);

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
    '@abuddy/sdk': '*',
  },
  devDependencies: {
    typescript: '^5.8.3',
    vitest: '^3.2.1',
  },
}, null, 2);

const VITEST_CONFIG_TEMPLATE = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
`;

const STEPS_REGISTER_TEMPLATE = `import type { StepDefinition } from '@abuddy/sdk/steps';

export const steps: StepDefinition[] = [
  // Add your step definitions here
];
`;

const EXAMPLE_FLOW_TEMPLATE = `import type { FlowDSL } from '@abuddy/sdk/build';
import { entry, on, keepAlive } from '#generated/flow-helpers';

export default {
  "Example Flow": [
    entry([keepAlive()]),
  ],
} satisfies FlowDSL;
`;

const EXAMPLE_TEST_TEMPLATE = (name: string) => `import { describe, it, expect } from 'vitest';

describe('${name}', () => {
  it('should have a valid manifest', async () => {
    const manifest = await import('../../abuddy.json', { with: { type: 'json' } });
    expect(manifest.default.id).toBe('${name}');
  });
});
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
  fs.mkdirSync(path.join(dir, 'src', 'features', name), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests', 'unit'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });

  fs.writeFileSync(path.join(dir, 'abuddy.json'), MANIFEST_TEMPLATE(name));
  fs.writeFileSync(path.join(dir, 'package.json'), PACKAGE_JSON_TEMPLATE(name));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG_TEMPLATE);
  fs.writeFileSync(path.join(dir, '.gitignore'), GITIGNORE_TEMPLATE);
  fs.writeFileSync(
    path.join(dir, 'src', 'features', name, 'feature.config.ts'),
    FEATURE_CONFIG_TEMPLATE(name),
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'features', name, 'settings.ts'),
    SETTINGS_TEMPLATE(name),
  );
  fs.writeFileSync(
    path.join(dir, 'vitest.config.ts'),
    VITEST_CONFIG_TEMPLATE,
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'extensions', 'steps', 'register.ts'),
    STEPS_REGISTER_TEMPLATE,
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'seeds', 'flows', 'example-flow.ts'),
    EXAMPLE_FLOW_TEMPLATE,
  );
  fs.writeFileSync(
    path.join(dir, 'tests', 'unit', `${name}.spec.ts`),
    EXAMPLE_TEST_TEMPLATE(name),
  );

  await generate([], dir);
  await generateEntries([], dir);

  console.log(`\nCreated pack "${name}" at ./${name}/`);
  console.log(`\nImport types in your seed code:`);
  console.log(`  import type { ActionMeta } from '@abuddy/sdk/build';`);
  console.log(`  import type { Services, Z } from '#generated/services';`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${name}`);
  console.log(`  npm install`);
  console.log(`  abuddy build`);
}
