import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePackFiles, PACK_TYPES_DEF, PACK_TYPES_FORMAT, type PackManifest, type PackSnapshot } from '@abuddy/sdk/build';
import { warnStaleDepTypes } from '../../src/commands/generate-entries';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-types-version-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** Writes the facade types generation produces for base-pack at `version` */
function generateDepTypes(version: string): void {
  const manifest = { id: 'app-pack', name: 'App', version: '1.0.0' } as PackManifest;
  const snapshot = { types: { entities: {}, relKinds: {} }, defs: { [PACK_TYPES_DEF]: 'export type PackEvents = {};' }, typesFormat: PACK_TYPES_FORMAT, manifest: { id: 'base-pack', name: 'Base', version } } as PackSnapshot;
  for (const [file, content] of Object.entries(generatePackFiles(manifest, { packRoot: root, depSnapshots: new Map([['base-pack', snapshot]]) }))) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
}

describe('warnStaleDepTypes', () => {
  it('warns when the dependency the pack builds with is not the version its facade types came from', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    generateDepTypes('1.2.0');

    warnStaleDepTypes(root, new Map([['base-pack', '1.2.0']]));
    expect(warn).not.toHaveBeenCalled();

    warnStaleDepTypes(root, new Map([['base-pack', '1.3.0']]));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('src/__generated__/deps/base-pack.d.ts has the types of base-pack@1.2.0, but the pack builds with base-pack@1.3.0'));
  });

  it('skips a dependency without facade types', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnStaleDepTypes(root, new Map([['base-pack', '1.0.0']]));
    expect(warn).not.toHaveBeenCalled();
  });
});
