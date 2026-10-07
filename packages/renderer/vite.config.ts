import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { delimiter, dirname, resolve } from 'node:path'
import { defineConfig, defaultClientConditions, defaultServerConditions, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { getSharedFeDeps, getSdkFeModules, getUiFeModules } from '@abuddy/host/build/shared-deps'
import { devPackFrontendsModule, discoverDevPackFrontends } from '@abuddy/host/build/discover'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
const packagesRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const rendererSrcDir = fileURLToPath(new URL('./src/', import.meta.url));

/**
 * `virtual:dev-pack-frontends` — the packs whose frontend this window serves from source, and the
 * renderer's own `@/`.
 *
 * **Serving a pack's frontend from source is the whole of what a dev server adds**, and it is what makes a
 * `.vue` edit patch the component: the pack's modules are in the renderer's own graph, so Vite has an
 * accepting importer to stop the update at. A built app has no source to serve, so the map is empty there
 * and every pack's frontend is fetched over `pack://` from the bundle its own `abuddy build` wrote — which
 * is the path a pack takes in production whatever directory it lives in.
 *
 * The map is keyed by pack id and says nothing about `builtIn`: a pack is in it because its source is on
 * this disk.
 */
function devPackFrontendsPlugin(serving: boolean): Plugin {
  const VIRTUAL_ID = 'virtual:dev-pack-frontends';
  const RESOLVED_VIRTUAL = '\0' + VIRTUAL_ID;
  const packs = serving ? discoverDevPackFrontends(packagesRoot, process.env.ABUDDY_DEV_PACK_DIRS, process.cwd()) : [];
  const virtualContent = devPackFrontendsModule(packs);
  // Those packs' components are in this window's CSS too, and `tailwind.config.ts` is loaded by PostCSS
  // rather than from here, so this is how it is told. **A declaration, not an inference**: it must not read
  // `NODE_ENV` to work out whether a dev server is running (`identity-guard.spec.ts`), and nothing but a
  // serving config writes this.
  process.env.ABUDDY_DEV_PACK_SOURCES = packs.map((pack) => dirname(dirname(dirname(pack.feEntry)))).join(delimiter);
  if (serving) console.log(`[dev-pack-frontends] serving from source: ${packs.map((pack) => pack.id).join(', ') || 'none'}`);

  return {
    name: 'dev-pack-frontends',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (source === VIRTUAL_ID) return RESOLVED_VIRTUAL;

      // The renderer's own `@/`, and only the renderer's: `tsconfig.app.json` maps it to ./src/*. It used to
      // mean "the importer's pack, or the renderer" — a per-importer rule, which is why four bundler configs
      // each had to implement it. Packs name their own modules with `#` subpath imports now, which Node, Vite
      // and esbuild resolve from the pack's own package.json with no help from here.
      if (source.startsWith('@/') && importer) {
        return this.resolve(resolve(rendererSrcDir, source.slice(2)), importer, { skipSelf: true });
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
  const feDeps = getSharedFeDeps(import.meta.dirname);
  const sdkModules = getSdkFeModules();

  // Aliases share a global (prosemirror-model and @tiptap/pm/model): import each once
  const depGlobals = [...new Map(Object.entries(feDeps).map(([specifier, { globalKey }]) => [globalKey, specifier])).entries()];
  const depsImportLines = depGlobals
    .map(([, specifier], i) => `import * as dep${i} from '${specifier}';`)
    .join('\n');
  const sdkImportLines = Object.entries(sdkModules)
    .map(([pkg, { globalKey }]) => `import * as ${globalKey} from '${pkg}';`)
    .join('\n');
  // Pack FE code gets @abuddy/ui from the host too, keyed by specifier
  const uiModules = Object.keys(getUiFeModules(fileURLToPath(new URL('.', import.meta.url))));
  const uiImportLines = uiModules.map((specifier, i) => `import * as ui${i} from '${specifier}';`).join('\n');
  const allKeys = [
    ...depGlobals.map(([globalKey], i) => `${JSON.stringify(globalKey)}: dep${i}`),
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

export default defineConfig(({ command }) => ({
  base: './',
  build: {
    modulePreload: false,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    devPackFrontendsPlugin(command === 'serve'),
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
}))
