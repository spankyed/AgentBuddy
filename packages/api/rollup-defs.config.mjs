import dts from 'rollup-plugin-dts';
import { builtinModules } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const apiDir = resolve(__dirname, '.');
const outDir = resolve(__dirname, '../abuddy-sdk/src/fe/components/types-generated');
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

// Monaco Editor configs (wrapped in declare module)
const createConfig = (name, input) => ({
  input: resolve(apiDir, input),
  output: {
    file: resolve(outDir, `${name}-defs.d.ts`),
    format: 'es',
    intro: `declare module "@app/defs/${name}" {`,
    outro: `}`,
    generatedCode: {
      constBindings: true,
    },
  },
  plugins: [dtsPlugin(), cleanupPlugin()],
  external: builtinModules,
});

// Default-setup configs (unwrapped)
const createDefaultSetupConfig = (name, input) => ({
  input: resolve(apiDir, input),
  output: { file: resolve(defaultSetupDefsDir, `${name}-defs.d.ts`), format: 'es' },
  plugins: [dtsPlugin(), cleanupPlugin()],
  external: builtinModules,
});

// Export configurations for each DSL
export default [
  createConfig('action', 'defs/action.ts'),
  createConfig('prompt', 'defs/prompt.ts'),
  createConfig('database', 'defs/database.ts'),
  // Default-setup compatible (unwrapped) versions
  createDefaultSetupConfig('action', 'defs/action.ts'),
  createDefaultSetupConfig('prompt', 'defs/prompt.ts'),
  createDefaultSetupConfig('default-setup', 'defs/default-setup.ts'),
];
