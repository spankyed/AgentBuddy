import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, REPO_ROOT, installPublishedPackages } from '../helpers/published-packages';

const TSC = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc');

let consumer: string | undefined;
beforeAll(() => {
  if (PACKAGES_BUILT) consumer = installPublishedPackages();
}, 120_000);
afterAll(() => {
  if (consumer) fs.rmSync(consumer, { recursive: true, force: true });
});

function typecheck(dir: string, moduleResolution: 'node16' | 'bundler'): { code: number; output: string } {
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: moduleResolution === 'node16' ? 'node16' : 'esnext', moduleResolution,
      strict: true, skipLibCheck: true, noEmit: true, types: [], lib: ['ES2022', 'DOM'],
    },
    include: ['env.d.ts', 'index.ts'],
  }));
  // The scaffold's shim for the pack's own SFCs must not shadow the published component types
  fs.writeFileSync(path.join(dir, 'env.d.ts'), [
    "declare module '*.vue' {",
    "  import type { DefineComponent } from 'vue';",
    '  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>;',
    '  export default component;',
    '}',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'index.ts'), [
    "import { h } from 'vue';",
    "import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor.vue';",
    "import SimpleMonacoEditor from '@abuddy/ui/components/SimpleMonacoEditor.vue';",
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
  ].join('\n'));
  try {
    return { code: 0, output: execFileSync(TSC, ['-p', dir], { stdio: 'pipe' }).toString() };
  } catch (err: any) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe.skipIf(!PACKAGES_BUILT)('published @abuddy/ui declarations', () => {
  it.each(['node16', 'bundler'] as const)('types component props and composables for moduleResolution %s', (moduleResolution) => {
    fs.writeFileSync(path.join(consumer!, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module' }));
    const result = typecheck(consumer!, moduleResolution);
    expect(result.code, result.output).toBe(0);
  }, 120_000);
});
