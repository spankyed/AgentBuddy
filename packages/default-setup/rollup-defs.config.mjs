import dts from 'rollup-plugin-dts';
import { builtinModules } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const monacoOutDir = resolve(__dirname, 'dist/defs/monaco');
const authoringOutDir = resolve(__dirname, 'dist/defs');

const tsconfigRaw = readFileSync(resolve(__dirname, 'tsconfig.defs.json'), 'utf-8');
const tsconfigJson = tsconfigRaw.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const tsconfig = JSON.parse(tsconfigJson);
const paths = Object.fromEntries(
  Object.entries(tsconfig.compilerOptions?.paths ?? {}).map(([key, values]) => [
    key,
    values.map(v => resolve(__dirname, v)),
  ])
);

/** Packages whose declarations the Monaco defs inline (Monaco loads no node_modules): the AI SDK's, for services.inference */
const INLINED_PACKAGES = ['ai', '@ai-sdk/provider', '@ai-sdk/provider-utils', '@ai-sdk/gateway', '@standard-schema/spec'];
const inlined = (id) => INLINED_PACKAGES.some((name) => id === name || id.startsWith(`${name}/`));
const isBare = (id) => !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0');
const aliased = (id) => Object.keys(paths).some((key) => key.endsWith('/*') ? id.startsWith(key.slice(0, -1)) : id === key);

const dtsPlugin = () => dts({
  respectExternal: true,
  compilerOptions: {
    paths,
    baseUrl: __dirname,
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

const shared = {
  plugins: [dtsPlugin(), cleanupPlugin()],
  // Other packages stay imports: workspace sources (tsconfig paths) and the inlined packages are bundled
  external: (id) => builtinModules.includes(id) || id.startsWith('node:') || (isBare(id) && !aliased(id) && !inlined(id)),
};

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

// Read the generated defs config
const defsManifest = (await import('./src/__generated__/defs.config.mjs')).default;

export default defsManifest.map(({ name, entry, targets }) => {
  const outputs = [];
  if (targets.includes('monaco')) outputs.push(monacoOutput(name));
  if (targets.includes('authoring')) outputs.push(authoringOutput(name));

  return {
    input: resolve(__dirname, entry),
    output: outputs.length === 1 ? outputs[0] : outputs,
    ...shared,
  };
});
