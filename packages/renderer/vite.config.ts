import { fileURLToPath } from 'node:url'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
const packagesRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const rendererSrcDir = fileURLToPath(new URL('./src/', import.meta.url));
interface BuiltInPack { id: string; srcDir: string }

function discoverBuiltInPacks(): BuiltInPack[] {
  const packs: BuiltInPack[] = [];
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = resolve(packagesRoot, entry.name, 'abuddy.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      if (m.builtIn && m.id) packs.push({ id: m.id, srcDir: resolve(packagesRoot, entry.name, 'src') });
    } catch {}
  }
  return packs;
}

const packs = discoverBuiltInPacks();

/**
 * Single plugin for all built-in pack resolution:
 * - virtual:built-in-packs — auto-imports each pack's FE entry
 * - @<pack-id>/* — namespace alias into each pack's src/
 * - @/ — scoped to the importer's pack (or renderer/src/ for renderer files)
 */
function builtInPacksPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:built-in-packs';
  const RESOLVED_VIRTUAL = '\0' + VIRTUAL_ID;

  const feEntries = packs
    .filter(p => existsSync(resolve(p.srcDir, '__generated__/pack-entry-fe.ts')))
    .map(p => `  '${p.id}': () => import('@${p.id}/__generated__/pack-entry-fe'),`)
    .join('\n');
  const virtualContent = `export default {\n${feEntries}\n};\n`;

  return {
    name: 'built-in-packs',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (source === VIRTUAL_ID) return RESOLVED_VIRTUAL;

      for (const pack of packs) {
        const prefix = `@${pack.id}/`;
        if (source.startsWith(prefix)) {
          return this.resolve(resolve(pack.srcDir, source.slice(prefix.length)), importer, { skipSelf: true });
        }
      }

      if (source.startsWith('@/') && importer) {
        const pack = packs.find(p => importer.startsWith(p.srcDir + '/'));
        return this.resolve(resolve(pack ? pack.srcDir : rendererSrcDir, source.slice(2)), importer, { skipSelf: true });
      }
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL) return virtualContent;
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    builtInPacksPlugin(),
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('media-'),
        },
      },
    }),
    vueDevTools(),
  ],
  resolve: {
    alias: [
      { find: '@abuddy/sdk/rpc', replacement: fileURLToPath(new URL('./src/core/trpc.ts', import.meta.url)) },
      { find: '@abuddy/api', replacement: fileURLToPath(new URL('../api/src', import.meta.url)) },
    ],
  },
  optimizeDeps: {
    include: [
      'monaco-editor',
      '@xterm/xterm',
      '@xterm/addon-fit',
      '@xterm/addon-web-links',
      'xstate',
      '@xstate/vue',
      'lucide-vue-next'
    ]
  },
})
