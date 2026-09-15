import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONSUMER_MATRIX, PACKAGES_BUILT, REPO_ROOT, compileConsumer, installPublishedPackages, type TscVersion } from '../helpers/published-packages';

let consumer: string | undefined;
beforeAll(() => {
  if (PACKAGES_BUILT) consumer = installPublishedPackages();
}, 120_000);
afterAll(() => {
  if (consumer) fs.rmSync(consumer, { recursive: true, force: true });
});

function typecheck(dir: string, tsc: TscVersion, moduleResolution: 'node16' | 'bundler'): { code: number; output: string } {
  return compileConsumer(dir, tsc, moduleResolution, {
    // The scaffold's shim for the pack's own SFCs must not shadow the published component types
    'env.d.ts': [
      "declare module '*.vue' {",
      "  import type { DefineComponent } from 'vue';",
      '  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>;',
      '  export default component;',
      '}',
    ],
    'index.ts': [
      "import { h } from 'vue';",
      "import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor';",
      "import SimpleMonacoEditor from '@abuddy/ui/components/SimpleMonacoEditor';",
      "import { useDebounceFn } from '@abuddy/ui/composables/useDebounce';",
      "import { tiptapPluginRegistry } from '@abuddy/sdk/fe';",
      "export const editor = h(TiptapEditor, { mode: 'editor', modelValue: 'text' });",
      "export const code = h(SimpleMonacoEditor, { modelValue: 'const x = 1' });",
      "export const plugins = tiptapPluginRegistry.getAll();",
      "export const debounce = useDebounceFn(100);",
      'debounce(() => {});',
      '// @ts-expect-error modelValue is a string',
      "export const wrongProp = h(SimpleMonacoEditor, { modelValue: 42 });",
      '// @ts-expect-error debounce takes a callback',
      'debounce(42);',
    ],
  });
}

describe.skipIf(!PACKAGES_BUILT)('published @abuddy/ui declarations', () => {
  it.each(CONSUMER_MATRIX)('types component props and composables for TypeScript $tsc, moduleResolution $moduleResolution', ({ tsc, moduleResolution }) => {
    const result = typecheck(consumer!, tsc, moduleResolution);
    expect(result.code, result.output).toBe(0);
  }, 120_000);
});
