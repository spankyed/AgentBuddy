import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  
  {
    ...pluginVitest.configs.recommended,
    files: ['tests/**/*'],
  },

  {
    // A .cjs file is CommonJS by extension, so `require` is the only import it has. The TypeScript rule assumes ESM.
    name: 'app/commonjs-configs',
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    name: 'app/vue-rules-that-do-not-apply-here',
    rules: {
      // Vue's Priority A rule guards against a single-word component name colliding with an HTML element, since
      // every HTML element is one word. It guards a global registry: these components are imported in
      // `<script setup>` and referenced by the import binding, so `<Toolbar>` resolves to the import and there is
      // no lookup for an element to collide with. It also fights the plugin layout, where `canvas.vue` is the name
      // of a feature's canvas area — every feature has one, in this package and in every pack.
      'vue/multi-word-component-names': 'off',
    },
  },

  ...pluginOxlint.configs['flat/recommended'],
)
