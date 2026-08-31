import dts from 'rollup-plugin-dts';
import { builtinModules } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const apiDir = resolve(__dirname, '.');
const monacoOutDir = resolve(__dirname, '../abuddy-sdk/src/fe/components/types-generated');
const defaultSetupDefsDir = resolve(__dirname, '../default-setup/defs');

// Derive paths from api/tsconfig.json (single source of truth)
const tsconfigRaw = readFileSync(resolve(apiDir, 'tsconfig.json'), 'utf-8');
const tsconfigJson = tsconfigRaw.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const tsconfig = JSON.parse(tsconfigJson);
const paths = Object.fromEntries(
  Object.entries(tsconfig.compilerOptions?.paths ?? {}).map(([key, values]) => [
    key,
    values.map(v => resolve(apiDir, v)),
  ])
);

const dtsPlugin = () => dts({
  respectExternal: false,
  compilerOptions: {
    paths,
    baseUrl: apiDir,
    declaration: true,
    emitDeclarationOnly: true,
  },
});

const cleanupPlugin = () => ({
  name: 'cleanup-dollar-suffixes',
  renderChunk(code) {
    return code.replace(/\b(\w+)\$\d+\b/g, '$1');
  },
});

const shared = { plugins: [dtsPlugin(), cleanupPlugin()], external: builtinModules };

// Shared entries: bundle once, output both Monaco (wrapped) and default-setup (unwrapped)
const createSharedConfig = (name, input) => ({
  input: resolve(apiDir, input),
  output: [
    {
      file: resolve(monacoOutDir, `${name}-defs.d.ts`),
      format: 'es',
      intro: `declare module "@app/defs/${name}" {`,
      outro: `}`,
      generatedCode: { constBindings: true },
    },
    { file: resolve(defaultSetupDefsDir, `${name}-defs.d.ts`), format: 'es' },
  ],
  ...shared,
});

// Monaco-only entry
const createMonacoConfig = (name, input) => ({
  input: resolve(apiDir, input),
  output: {
    file: resolve(monacoOutDir, `${name}-defs.d.ts`),
    format: 'es',
    intro: `declare module "@app/defs/${name}" {`,
    outro: `}`,
    generatedCode: { constBindings: true },
  },
  ...shared,
});

// Default-setup-only entry
const createDefaultSetupConfig = (name, input) => ({
  input: resolve(apiDir, input),
  output: { file: resolve(defaultSetupDefsDir, `${name}-defs.d.ts`), format: 'es' },
  ...shared,
});

export default [
  createSharedConfig('action', 'defs/action.ts'),
  createSharedConfig('prompt', 'defs/prompt.ts'),
  createMonacoConfig('database', 'defs/database.ts'),
  createDefaultSetupConfig('default-setup', 'defs/default-setup.ts'),
];
