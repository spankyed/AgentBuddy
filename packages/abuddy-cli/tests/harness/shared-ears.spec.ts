// The harness fails early, naming both copies, when a pack's @abuddy/ears isn't the copy its @abuddy/sdk loads
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assertSharedEars } from '../../../abuddy-testing/src/shared-ears.ts';

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

function writePackage(dir: string, name: string, version: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version }));
}

/** A pack with @abuddy/sdk 0.2.0 installed, and `ears` placing @abuddy/ears copies */
function pack(ears: { top?: string; nested?: string }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-shared-ears-'));
  dirs.push(root);
  writePackage(root, 'my-pack', '1.0.0');
  const modules = path.join(root, 'node_modules', '@abuddy');
  writePackage(path.join(modules, 'sdk'), '@abuddy/sdk', '0.2.0');
  if (ears.top) writePackage(path.join(modules, 'ears'), '@abuddy/ears', ears.top);
  if (ears.nested) writePackage(path.join(modules, 'sdk', 'node_modules', '@abuddy', 'ears'), '@abuddy/ears', ears.nested);
  return root;
}

describe('assertSharedEars', () => {
  it('accepts a pack whose @abuddy/sdk loads the pack\'s @abuddy/ears', () => {
    expect(() => assertSharedEars(pack({ top: '0.2.0' }))).not.toThrow();
  });

  it('names both copies when npm nested another @abuddy/ears under @abuddy/sdk', () => {
    expect(() => assertSharedEars(pack({ top: '0.1.0', nested: '0.2.0' })))
      .toThrow(/The pack's @abuddy\/ears 0\.1\.0 and @abuddy\/sdk's @abuddy\/ears 0\.2\.0 are different copies .*install matching versions/);
  });

  it('asks to install @abuddy/ears when the pack has none', () => {
    expect(() => assertSharedEars(pack({ nested: '0.2.0' }))).toThrow(/@abuddy\/ears isn't installed in .*add it to the pack's dependencies, at the version @abuddy\/sdk 0\.2\.0 uses/);
  });

  it('accepts the workspace layout the monorepo\'s fixture packs use', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-shared-ears-'));
    dirs.push(root);
    writePackage(root, 'fixture-pack', '1.0.0');
    fs.symlinkSync(path.resolve(__dirname, '..', '..', '..', '..', 'node_modules'), path.join(root, 'node_modules'), 'dir');
    expect(() => assertSharedEars(root)).not.toThrow();
  });
});
