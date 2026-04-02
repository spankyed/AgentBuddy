import dts from 'rollup-plugin-dts';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const apiDir = resolve(__dirname, '.');
const outDir = resolve(__dirname, '../renderer/src/core/types/generated');
const scratchpadOutDir = resolve(apiDir, 'defs/dist/scratchpad');

const dtsPlugin = () => dts({
  respectExternal: false, // Bundle all external types
  compilerOptions: {
    paths: {
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
    // Replace any identifier$1 with identifier
    return code.replace(/\b(\w+)\$1\b/g, '$1');
  },
});

// Monaco Editor configs (wrapped in declare module)
const createConfig = (name, input, moduleName) => ({
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
  external: [],
});

// Scratchpad configs (unwrapped, for direct import)
const createScratchpadConfig = (name, input) => ({
  input: resolve(apiDir, input),
  output: {
    file: resolve(scratchpadOutDir, `${name}-defs.d.ts`),
    format: 'es',
  },
  plugins: [dtsPlugin(), cleanupPlugin()],
  external: [],
});

// Export configurations for each DSL
export default [
  createConfig('action', 'defs/action.ts', 'ActionDSL'),
  createConfig('prompt', 'defs/prompt.ts', 'PromptDSL'),
  createConfig('database', 'defs/database.ts', 'DatabaseDSL'),
  // Scratchpad-compatible (unwrapped) versions
  createScratchpadConfig('action', 'defs/action.ts'),
  createScratchpadConfig('prompt', 'defs/prompt.ts'),
];
