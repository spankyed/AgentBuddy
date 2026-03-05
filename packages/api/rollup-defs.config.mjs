import dts from 'rollup-plugin-dts';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const apiDir = resolve(__dirname, '.');
const outDir = resolve(__dirname, '../renderer/src/core/types');

// Common rollup config for all DSL modules
const createConfig = (name, input, moduleName) => ({
  input: resolve(apiDir, input),
  output: {
    file: resolve(outDir, `${name}-defs.d.ts`),
    format: 'es',
    intro: `declare module "@app/defs/${name}" {`,
    outro: `}`,
    // Don't add any UMD globals or namespace declarations
    generatedCode: {
      constBindings: true,
    },
  },
  plugins: [
    dts({
      respectExternal: false, // Bundle all external types
      compilerOptions: {
        paths: {
          '@/*': [resolve(apiDir, 'src/*')],
        },
        baseUrl: apiDir,
        declaration: true,
        emitDeclarationOnly: true,
      },
    }),
    // Post-process to clean up any $1 suffixes
    {
      name: 'cleanup-dollar-suffixes',
      renderChunk(code) {
        // Replace any identifier$1 with identifier
        return code.replace(/\b(\w+)\$1\b/g, '$1');
      },
    },
  ],
  external: [], // Bundle everything, no externals
});

// Export configurations for each DSL
export default [
  createConfig('action', 'defs/action.ts', 'ActionDSL'),
  createConfig('prompt', 'defs/prompt.ts', 'PromptDSL'),
  createConfig('database', 'defs/database.ts', 'DatabaseDSL'),
];
