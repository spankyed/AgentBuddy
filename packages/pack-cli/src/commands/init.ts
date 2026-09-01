import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { generate } from './generate';

const MANIFEST_TEMPLATE = (name: string) => {
  const pascalName = name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
  return JSON.stringify({
    id: name,
    name: name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
    version: '0.1.0',
    hostVersion: '>=0.3.0',
    entities: { [pascalName]: pascalName },
    relKinds: {},
    seedTypes: ['actions', 'flows'],
    plugins: [],
    dependencies: {},
    permissions: [],
  }, null, 2);
};

const PACK_CONFIG_TEMPLATE = (name: string) => `import type { PackConfig } from '@abuddy/sdk/build';

export default {
  name: '${name}',
  actions: './src/seeds/actions',
  flows: './src/seeds/flows',
} satisfies PackConfig;
`;

const PLUGIN_CONFIG_TEMPLATE = (name: string) => `import type { PluginConfig } from '@abuddy/sdk/build';

export default {
  name: '${name}',
  settings: './settings.ts',
} satisfies PluginConfig;
`;

const ENTITIES_TEMPLATE = `export { EARS, BaseEntity } from '../.abuddy/generated/ears';
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
  include: ['src/**/*.ts', '.abuddy/generated/**/*.ts', '.abuddy/deps/**/*.d.ts'],
}, null, 2);

const PACKAGE_JSON_TEMPLATE = (name: string) => JSON.stringify({
  name: `@abuddy-pack/${name}`,
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: {
    generate: 'abuddy generate',
    build: 'abuddy build',
    validate: 'abuddy validate',
    dev: 'abuddy dev',
    typecheck: 'tsc --noEmit',
  },
  devDependencies: {
    '@abuddy/sdk': '*',
    typescript: '^5.8.3',
  },
}, null, 2);

const GITIGNORE_TEMPLATE = `node_modules/
dist/
.abuddy/
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
  fs.mkdirSync(path.join(dir, 'src', 'plugins', name), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });

  fs.writeFileSync(path.join(dir, 'abuddy.json'), MANIFEST_TEMPLATE(name));
  fs.writeFileSync(path.join(dir, 'package.json'), PACKAGE_JSON_TEMPLATE(name));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG_TEMPLATE);
  fs.writeFileSync(path.join(dir, '.gitignore'), GITIGNORE_TEMPLATE);
  fs.writeFileSync(path.join(dir, 'pack.config.ts'), PACK_CONFIG_TEMPLATE(name));
  fs.writeFileSync(
    path.join(dir, 'src', 'plugins', name, 'plugin.config.ts'),
    PLUGIN_CONFIG_TEMPLATE(name),
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'entities.ts'),
    ENTITIES_TEMPLATE,
  );

  await generate([], dir);

  console.log(`\nCreated pack "${name}" at ./${name}/`);
  console.log(`\nGenerated types at .abuddy/generated/ears.ts`);
  console.log(`\nImport entities in your pack code:`);
  console.log(`  import { EARS } from '../entities';`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${name}`);
  console.log(`  npm install`);
  console.log(`  abuddy build`);
}
