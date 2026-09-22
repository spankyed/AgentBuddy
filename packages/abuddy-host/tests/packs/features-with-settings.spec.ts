// The features whose plugin settings may be written: every installed feature that declares settings. A registered
// pack's come from its registration; a pack in the packs dir that isn't registered (disabled, or one that didn't load)
// keeps its settings, so its features come from its manifest. The answer is kept until the registrations or the dir's
// entries change: a settings call on every chat message reads it.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setup } from 'xstate';
import type { PackRegistration } from '@abuddy/sdk/framework';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';

const memoPack: PackRegistration = {
  id: 'memo-pack',
  features: {
    memos: { plugin: { receives: [] }, settings: { plugins: { memos: { sort: 'new' } } } },
    // A plugin with no declared defaults: its settings form may still write its slice
    board: { plugin: { receives: [] } },
    // No settings file and no plugin, so nothing may be written for it
    systemOnly: { system: { machine: setup({}).createMachine({}), receives: [] } },
  },
};

let packsDir: string;
beforeEach(() => { packsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'features-with-settings-')); });
afterEach(() => fs.rmSync(packsDir, { recursive: true, force: true }));

/** Installs a pack's manifest in the packs dir, as the installer places it */
function install(id: string, manifest: unknown): void {
  fs.mkdirSync(path.join(packsDir, id));
  fs.writeFileSync(path.join(packsDir, id, 'abuddy.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
}

const manifest = (id: string, features: unknown) => ({ id, name: id, version: '1.0.0', features });

describe('featuresWithSettings', () => {
  it("lists a registered pack's features that declare settings", () => {
    const registry = createPackRegistry();
    registry.registerPack(memoPack);

    expect(registry.featuresWithSettings()).toEqual(['memo-pack/memos', 'memo-pack/board']);

    registry.unregisterPack('memo-pack');
    expect(registry.featuresWithSettings()).toEqual([]);
  });

  it("adds an installed pack's features from its manifest while it isn't registered, and reads a malformed one as none", () => {
    install('memo-pack', manifest('memo-pack', [{ id: 'memos', settings: 'src/memos/settings.ts' }, { id: 'board', plugin: { entry: 'src/board/fe.ts' } }, { id: 'systemOnly', system: { entry: 'x' } }]));
    install('idle-pack', manifest('idle-pack', [{ id: 'idle', settings: 'src/settings.ts' }]));
    install('broken-pack', manifest('broken-pack', { idle: {} }));
    install('odd-pack', manifest('odd-pack', [{ id: 'Not An Id', settings: 'x' }]));
    install('garbled-pack', '{ not json');
    const registry = createPackRegistry({ installedPacksDir: () => packsDir });

    expect(registry.featuresWithSettings()).toEqual(expect.arrayContaining(['memo-pack/memos', 'memo-pack/board', 'idle-pack/idle']));
    expect(registry.featuresWithSettings()).toHaveLength(3);

    // Registered, its registration counts too, and a feature both name is listed once
    registry.registerPack({ ...memoPack, features: { memos: memoPack.features!.memos, board: { plugin: { receives: [] }, settings: {} } } });
    expect(registry.featuresWithSettings()).toEqual(expect.arrayContaining(['memo-pack/memos', 'memo-pack/board', 'idle-pack/idle']));
    expect(registry.featuresWithSettings()).toHaveLength(3);
  });

  it("keeps its answer until the dir's entries change, and sees a pack installed or removed then", () => {
    install('idle-pack', manifest('idle-pack', [{ id: 'idle', settings: 'src/settings.ts' }]));
    const registry = createPackRegistry({ installedPacksDir: () => packsDir });
    expect(registry.featuresWithSettings()).toEqual(['idle-pack/idle']);

    // A manifest changed in place, which no install does, isn't read again: the dir's entries are the same
    fs.writeFileSync(path.join(packsDir, 'idle-pack', 'abuddy.json'), JSON.stringify(manifest('idle-pack', [])));
    expect(registry.featuresWithSettings()).toEqual(['idle-pack/idle']);

    install('memo-pack', manifest('memo-pack', [{ id: 'memos', settings: 'src/settings.ts' }]));
    expect(registry.featuresWithSettings()).toEqual(['memo-pack/memos']);

    fs.rmSync(path.join(packsDir, 'memo-pack'), { recursive: true });
    expect(registry.featuresWithSettings()).toEqual([]);
  });
});
