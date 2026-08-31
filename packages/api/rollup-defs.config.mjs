import dts from 'rollup-plugin-dts';
import { builtinModules } from 'module';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const apiDir = resolve(__dirname, '.');
const outDir = resolve(__dirname, '../abuddy-sdk/src/fe/components/types-generated');
const defaultSetupDefsDir = resolve(__dirname, '../default-setup/defs');

// Keep in sync with packages/api/tsconfig.json paths
const dtsPlugin = () => dts({
  respectExternal: false, // Bundle all external types
  compilerOptions: {
    paths: {
      '@/features/*': [resolve(apiDir, '../default-setup/src/features/*')],
      '@/registries/*': [resolve(apiDir, '../default-setup/src/registries/*')],
      '@/shared-services/*': [resolve(apiDir, '../default-setup/src/shared/services/*')],
      '@abuddy/sdk': [resolve(apiDir, '../abuddy-sdk/src/index.ts')],
      '@abuddy/sdk/*': [resolve(apiDir, '../abuddy-sdk/src/*/index.ts')],
      '@/*': [resolve(apiDir, 'src/*')],
    },
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
