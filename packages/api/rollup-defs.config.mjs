import dts from 'rollup-plugin-dts';
import { builtinModules } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import defsManifest from './defs/defs.config.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const apiDir = resolve(__dirname, '.');
const monacoOutDir = resolve(__dirname, 'dist/defs/monaco');
const authoringOutDir = resolve(__dirname, 'dist/defs');

// Derive paths from api/tsconfig.json (single source of truth)
const tsconfigRaw = readFileSync(resolve(apiDir, 'defs/tsconfig.json'), 'utf-8');
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

function monacoOutput(name) {
  return {
    file: resolve(monacoOutDir, `${name}-defs.d.ts`),
    format: 'es',
    intro: `declare module "@app/defs/${name}" {`,
    outro: `}`,
    generatedCode: { constBindings: true },
  };
}

function authoringOutput(name) {
  return { file: resolve(authoringOutDir, `${name}-defs.d.ts`), format: 'es' };
}

// Build rollup configs from manifest
export default defsManifest.map(({ name, entry, targets }) => {
  const outputs = [];
  if (targets.includes('monaco')) outputs.push(monacoOutput(name));
  if (targets.includes('authoring')) outputs.push(authoringOutput(name));

  return {
    input: resolve(apiDir, 'defs', entry),
    output: outputs.length === 1 ? outputs[0] : outputs,
    ...shared,
  };
});
