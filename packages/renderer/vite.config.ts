import { fileURLToPath, URL } from 'node:url'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
const packagesRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const rendererSrcDir = fileURLToPath(new URL('./src/', import.meta.url));
const sdkDir = resolve(packagesRoot, 'abuddy-sdk');

// ---------------------------------------------------------------------------
// Convention-based built-in pack discovery (mirrors packages/api/tsup.config.ts)
// ---------------------------------------------------------------------------

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

const builtInPacks = discoverBuiltInPacks();

/**
 * Vite plugin that resolves @/ imports based on the importer's location.
 *
 * When a file inside a built-in pack's src/ imports @/foo, the path resolves
 * within that pack's own src/ directory.  For all other importers (the
 * renderer itself), it resolves within renderer/src/.
 *
 * This replaces the previous approach of hardcoding per-directory aliases
 * (@/registries/*, @/plugins/*, etc.) that coupled the renderer's build
 * config to a specific pack's internal directory structure.
 */
function resolvePackAtAliases(): Plugin {
  return {
    name: 'resolve-pack-at-aliases',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!source.startsWith('@/') || !importer) return null;
      const subpath = source.slice(2);

      const pack = builtInPacks.find(p => importer.startsWith(p.srcDir + '/'));
      const rootDir = pack ? pack.srcDir : rendererSrcDir;
      return this.resolve(resolve(rootDir, subpath), importer, { skipSelf: true });
    },
  };
}

/**
 * Vite plugin that generates a virtual module importing all built-in packs'
 * FE entries. Adding a new built-in pack with pack-entry-fe.ts automatically
 * includes it — no renderer changes needed.
 *
 * TypeScript sees `declare module 'virtual:built-in-packs' {}` (in env.d.ts)
 * and never enters pack source trees.
 */
function injectBuiltInPacks(): Plugin {
  const virtualModuleId = 'virtual:built-in-packs';
  const resolvedId = '\0' + virtualModuleId;

  const feEntries = builtInPacks
    .filter(p => existsSync(resolve(p.srcDir, 'pack-entry-fe.ts')))
    .map(p => `@${p.id}/pack-entry-fe`);

  return {
    name: 'inject-built-in-packs',
    resolveId(id) {
      if (id === virtualModuleId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId) {
        return feEntries.map(entry => `import '${entry}';`).join('\n');
      }
    },
  };
}

// Namespace aliases for each built-in pack: @<pack-id>/* → <pack-src>/*
const packNamespaceAliases = builtInPacks.map(pack => ({
  find: new RegExp(`^@${pack.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(.+)$`),
  replacement: resolve(pack.srcDir, '$1'),
}));

// https://vite.dev/config/
export default defineConfig({
  base: './', // Use relative paths for Electron compatibility
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    injectBuiltInPacks(),
    resolvePackAtAliases(),
    vue({
      template: {
        compilerOptions: {
          // Vidstack player web components
          isCustomElement: (tag) => tag.startsWith('media-'),
        },
      },
    }),
    vueDevTools(),
  ],
  resolve: {
    alias: [
      ...packNamespaceAliases,
      // Map design system components to SDK
      { find: /^@\/core\/components\/design\/(.+)$/, replacement: resolve(sdkDir, 'src/fe/design/$1') },
      // Map shared components (tiptap, monaco, etc.) to SDK — layout/ stays in renderer
      { find: /^@\/core\/components\/(?!layout\/|ApiStatus)(.+)$/, replacement: resolve(sdkDir, 'src/fe/components/$1') },
      { find: /^@\/core\/utils\/monaco-config$/, replacement: resolve(sdkDir, 'src/fe/components/monaco-config.ts') },
      { find: /^@\/core\/composables\/(useMenuState|useContextMenu)(\.ts)?$/, replacement: resolve(sdkDir, 'src/fe/composables/$1.ts') },
      // SDK rpc module delegates to backend host modules — on the frontend, redirect to renderer's trpc
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
  // Removed hardcoded VITE_API_WS - port is now injected dynamically at runtime
})
