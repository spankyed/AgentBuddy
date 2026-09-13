import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
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

function typecheck(moduleResolution: 'node16' | 'bundler'): { code: number; output: string } {
  const tmp = consumer!;
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module' }));
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
    // Host-only modules live in the private @abuddy/host; the engine's host hook is source-only
    "// @ts-expect-error not published",
    "export * as internals from '@abuddy/sdk/ears/internals';",
    "// @ts-expect-error not published",
    "export * as packs from '@abuddy/sdk/packs';",
  ].join('\n'));
  try {
    return { code: 0, output: execFileSync(TSC, ['-p', tmp], { stdio: 'pipe' }).toString() };
  } catch (err: any) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe.skipIf(!PACKAGES_BUILT)('published @abuddy/sdk', () => {
  it.each(['node16', 'bundler'] as const)('typecheck for consumers using moduleResolution %s', (moduleResolution) => {
    const result = typecheck(moduleResolution);
    expect(result.code, result.output).toBe(0);
  }, 120_000);

  it('ships no host-only module', () => {
    const sdk = path.join(consumer!, 'node_modules', '@abuddy', 'sdk');
    // A plain Node process, as a pack's runtime resolves (test workers run with extra conditions)
    const resolveFromConsumer = (specifier: string) => execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `process.stdout.write(import.meta.resolve(${JSON.stringify(specifier)}))`],
      { cwd: consumer!, env: { PATH: process.env.PATH }, stdio: 'pipe' },
    ).toString();
    expect(() => resolveFromConsumer('@abuddy/sdk/ears/internals')).toThrow(/ERR_PACKAGE_PATH_NOT_EXPORTED/);
    expect(() => resolveFromConsumer('@abuddy/sdk/packs')).toThrow(/ERR_PACKAGE_PATH_NOT_EXPORTED/);
    expect(resolveFromConsumer('@abuddy/sdk/ears')).toBe(pathToFileURL(fs.realpathSync(path.join(sdk, 'dist', 'ears', 'index.js'))).href);
    const shipped = fs.readdirSync(path.join(sdk, 'dist'), { recursive: true }).map(String);
    expect(shipped.filter((f) => /^(packs|persistence|backup)\/|^ears\/internals\.|^fe\/(host|pack-store|app-extensions)\.|^build\/(discover|shared-deps)\./.test(f))).toEqual([]);
    expect(fs.readdirSync(sdk).sort()).toEqual(['abuddy.schema.json', 'dist', 'package.json']);
  });

  it.each(['sdk', 'ui'])('publishes the workspace package.json of @abuddy/%s as is', (name) => {
    const published = fs.readFileSync(path.join(consumer!, 'node_modules', '@abuddy', name, 'package.json'));
    const workspace = fs.readFileSync(path.join(REPO_ROOT, 'packages', `abuddy-${name}`, 'package.json'));
    expect(published.equals(workspace)).toBe(true);
  });
});
