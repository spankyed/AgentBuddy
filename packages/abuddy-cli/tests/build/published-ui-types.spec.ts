import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// Written by `npm run packages:build`; CI builds them before these tests
const SDK_PUBLISHED = path.join(REPO_ROOT, 'packages', 'abuddy-sdk', 'dist', 'package');
const UI_PUBLISHED = path.join(REPO_ROOT, 'packages', 'abuddy-ui', 'dist', 'package');
const TSC = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc');

let tmp: string | undefined;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

/** A consumer with the published SDK and UI, and the monorepo's copies of their peers. */
function makeConsumer(): string {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-consumer-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module' }));
  const modules = path.join(tmp, 'node_modules');
  fs.mkdirSync(path.join(modules, '@abuddy'), { recursive: true });
  for (const entry of fs.readdirSync(path.join(REPO_ROOT, 'node_modules'))) {
    if (entry === '@abuddy' || entry.startsWith('.')) continue;
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules', entry), path.join(modules, entry), 'dir');
  }
  fs.symlinkSync(SDK_PUBLISHED, path.join(modules, '@abuddy', 'sdk'), 'dir');
  fs.symlinkSync(UI_PUBLISHED, path.join(modules, '@abuddy', 'ui'), 'dir');
  return tmp;
}

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
    "import { getTiptapPlugins } from '@abuddy/sdk/fe';",
    "export const editor = h(TiptapEditor, { mode: 'editor', modelValue: 'text' });",
    "export const code = h(SimpleMonacoEditor, { modelValue: 'const x = 1' });",
    "export const plugins = getTiptapPlugins();",
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

describe.skipIf(!fs.existsSync(SDK_PUBLISHED) || !fs.existsSync(UI_PUBLISHED))('published @abuddy/ui declarations', () => {
  it.each(['node16', 'bundler'] as const)('types component props and composables for moduleResolution %s', (moduleResolution) => {
    const result = typecheck(makeConsumer(), moduleResolution);
    expect(result.code, result.output).toBe(0);
  }, 120_000);
});
