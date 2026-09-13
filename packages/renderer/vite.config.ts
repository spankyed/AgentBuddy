import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, defaultClientConditions, defaultServerConditions, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { getSharedFeDeps, getSdkFeModules, getUiFeModules } from '@abuddy/host/build/shared-deps'
import { discoverBuiltInPacksForBuild } from '@abuddy/host/build/discover'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
const packagesRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const rendererSrcDir = fileURLToPath(new URL('./src/', import.meta.url));

const packs = discoverBuiltInPacksForBuild(packagesRoot);

/**
 * Single plugin for all built-in pack resolution:
 * - virtual:built-in-packs — auto-imports each pack's FE entry
 * - @<pack-id>/* — namespace alias into each pack's src/
 * - @/ — scoped to the importer's pack (or renderer/src/ for renderer files)
 */
function builtInPacksPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:built-in-packs';
  const RESOLVED_VIRTUAL = '\0' + VIRTUAL_ID;

  const eligiblePacks = packs
    .filter(p => p.entryPath && existsSync(resolve(p.srcDir, '__generated__/pack-entry-fe.ts')));
  const staticImports = eligiblePacks
    .map((p, i) => `import _pack${i} from '@${p.id}/__generated__/pack-entry-fe';`)
    .join('\n');
  const loaderEntries = eligiblePacks
    .map((p, i) => `  '${p.id}': () => Promise.resolve({ default: _pack${i} }),`)
    .join('\n');
  const virtualContent = `${staticImports}\nexport default {\n${loaderEntries}\n};\n`;

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

function hostDepsPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:host-deps';
  const RESOLVED_VIRTUAL = '\0' + VIRTUAL_ID;
  const feDeps = getSharedFeDeps();
  const sdkModules = getSdkFeModules();

  const depsImportLines = Object.entries(feDeps)
    .map(([pkg, { globalKey }]) => `import * as ${globalKey} from '${pkg}';`)
    .join('\n');
  const sdkImportLines = Object.entries(sdkModules)
    .map(([pkg, { globalKey }]) => `import * as ${globalKey} from '${pkg}';`)
    .join('\n');
  // Pack FE code gets @abuddy/ui from the host too, keyed by specifier
  const uiModules = Object.keys(getUiFeModules(fileURLToPath(new URL('.', import.meta.url))));
  const uiImportLines = uiModules.map((specifier, i) => `import * as ui${i} from '${specifier}';`).join('\n');
  const allKeys = [
    ...Object.values(feDeps).map(d => d.globalKey),
    ...Object.values(sdkModules).map(d => d.globalKey),
    ...uiModules.map((specifier, i) => `${JSON.stringify(specifier)}: ui${i}`),
  ].join(', ');
  const virtualContent = `${depsImportLines}\n${sdkImportLines}\n${uiImportLines}\nwindow.__abuddy = { ${allKeys} };\n`;

  return {
    name: 'host-deps',
    enforce: 'pre',
    resolveId(source) { if (source === VIRTUAL_ID) return RESOLVED_VIRTUAL; },
    load(id) { if (id === RESOLVED_VIRTUAL) return virtualContent; },
  };
}

export default defineConfig({
  base: './',
  build: {
    modulePreload: false,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    builtInPacksPlugin(),
    hostDepsPlugin(),
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
    // Workspace @abuddy/* packages resolve to source (see their package.json exports)
    conditions: ['@abuddy/source', ...defaultClientConditions],
    alias: [
      { find: '@abuddy/sdk/rpc', replacement: fileURLToPath(new URL('./src/core/trpc.ts', import.meta.url)) },
      { find: '@abuddy/api', replacement: fileURLToPath(new URL('../api/src', import.meta.url)) },
    ],
  },
  ssr: { resolve: { conditions: ['@abuddy/source', ...defaultServerConditions] } },
  optimizeDeps: {
    include: [
      'monaco-editor',
      '@xterm/xterm',
      '@xterm/addon-fit',
      '@xterm/addon-web-links',
      '@xterm/addon-unicode11',
      '@xterm/addon-clipboard',
      '@xterm/addon-webgl',
      'xstate',
      '@xstate/vue',
      'lucide-vue-next',
      'reka-ui',
      '@vue-flow/core',
      '@vue-flow/background',
      '@vue-flow/controls',
      'elkjs/lib/elk.bundled.js',
      '@tiptap/core',
      '@tiptap/vue-3',
      '@tiptap/vue-3/menus',
      '@tiptap/starter-kit',
      '@tiptap/pm/state',
      '@tiptap/pm/view',
      '@tiptap/pm/commands',
      '@tiptap/extension-code',
      '@tiptap/extension-link',
      '@tiptap/extension-table',
      '@tiptap/extension-table-row',
      '@tiptap/extension-table-cell',
      '@tiptap/extension-table-header',
      '@tiptap/extension-task-list',
      '@tiptap/extension-task-item',
      '@tiptap/extension-placeholder',
      '@tiptap/extension-color',
      '@tiptap/extension-highlight',
      '@tiptap/extension-image',
      '@tiptap/extension-code-block-lowlight',
      '@tiptap/extension-blockquote',
      '@tiptap/extension-paragraph',
      '@tiptap/extension-horizontal-rule',
      '@tiptap/extension-details',
      'tiptap-markdown',
      'lowlight',
      'vue-arrange',
      '@leeoniya/ufuzzy',
      '@guolao/vue-monaco-editor',
      'vidstack/player',
      'vidstack/player/layouts/default',
      'vidstack/player/ui',
    ]
  },
})
