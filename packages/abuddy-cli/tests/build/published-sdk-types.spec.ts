import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// Written by `npm run packages:build`; CI builds it before these tests
const SDK_PUBLISHED = path.join(REPO_ROOT, 'packages', 'abuddy-sdk', 'dist', 'package');
const TSC = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc');

let tmp: string | undefined;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function typecheck(moduleResolution: 'node16' | 'bundler'): { code: number; output: string } {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-consumer-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module' }));
  fs.mkdirSync(path.join(tmp, 'node_modules', '@abuddy'), { recursive: true });
  fs.symlinkSync(SDK_PUBLISHED, path.join(tmp, 'node_modules', '@abuddy', 'sdk'), 'dir');
  fs.writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: moduleResolution === 'node16' ? 'node16' : 'esnext', moduleResolution,
      strict: true, skipLibCheck: true, noEmit: true, types: [],
    },
    include: ['index.ts'],
  }));
  // Barrels that re-export from relative modules, as consumers use them
  fs.writeFileSync(path.join(tmp, 'index.ts'), [
    "import { compareVersions } from '@abuddy/sdk/utils/pure';",
    "import type { StepDefinition } from '@abuddy/sdk/steps';",
    "import type { ActionMeta } from '@abuddy/sdk/build';",
    "export const newer: number = compareVersions('1.0.0', '0.9.0');",
    "export const step: StepDefinition | undefined = undefined;",
    "export type Meta = ActionMeta;",
    // Typed data access and events come only from the factories a pack's facade uses
    "import { defineEars } from '@abuddy/sdk/ears';",
    "import { defineEvents } from '@abuddy/sdk/services';",
    "import type { EARS } from '@abuddy/sdk';",
    "type IsAny<T> = 0 extends 1 & T ? true : false;",
    "interface MemoEntity { entityType: 'Memo'; text: string }",
    "const { findById } = defineEars<{ Memo: MemoEntity }>();",
    "declare const memoId: EARS.EntityId<'Memo'>;",
    "const memo = findById(memoId)!;",
    "export const text: string = memo.text;",
    "export const textNotAny: IsAny<typeof memo.text> = false;",
    "const { emit } = defineEvents<{ memos: { type: 'MEMO_ADDED'; id: string } }>();",
    "export const added = emit('memos', { type: 'MEMO_ADDED', id: 'm1' });",
    "// @ts-expect-error the memos plugin doesn't receive this event",
    "emit('memos', { type: 'MEMO_REMOVED' });",
    "// @ts-expect-error untyped query helpers aren't pack-facing",
    "export { findAll } from '@abuddy/sdk/ears';",
  ].join('\n'));
  try {
    return { code: 0, output: execFileSync(TSC, ['-p', tmp], { stdio: 'pipe' }).toString() };
  } catch (err: any) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe.skipIf(!fs.existsSync(SDK_PUBLISHED))('published @abuddy/sdk declarations', () => {
  it.each(['node16', 'bundler'] as const)('typecheck for consumers using moduleResolution %s', (moduleResolution) => {
    const result = typecheck(moduleResolution);
    expect(result.code, result.output).toBe(0);
  }, 120_000);
});
