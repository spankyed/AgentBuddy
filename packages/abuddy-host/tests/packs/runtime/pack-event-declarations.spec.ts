// A pack declares which event types each of its plugins receives, and the bus checks every send against
// that declaration. It reaches the app on the registration the pack's runtime bundle exports, so what this
// pins is that loading a pack doesn't lose it: a plugin with no declaration is read as one whose pack was
// built before declarations existed, and then nothing is checked at all — silently, for the packs the app
// controls least.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registry } from './test-host.ts';
import { loadExternalPacks, registerExternalPacks } from '../../../src/packs/runtime/loader.ts';

const PACK_ID = 'declaring-pack';
const RECEIVED = ['MEMOS_CONNECTED', 'MEMO_ADDED'];

let tmpDir: string;
let origEnv: { env?: string; userDataDir?: string };

/** An installed pack with one plugin feature, declaring what that plugin receives — what `abuddy build` emits */
function installDeclaringPack(received: Record<string, string[]> | undefined) {
  const packDir = path.join(tmpDir, 'packs', PACK_ID);
  fs.mkdirSync(path.join(packDir, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({
    id: PACK_ID, name: 'Declaring Pack', version: '1.0.0',
    features: [{ id: 'memos', plugin: { entry: 'fe/plugin.ts' } }],
  }));
  fs.writeFileSync(path.join(packDir, 'integrity.json'), JSON.stringify({ formatVersion: 1, id: PACK_ID, version: '1.0.0', files: {} }));
  fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), `module.exports = { registration: ${JSON.stringify({
    id: PACK_ID,
    systems: [],
    features: [{ id: 'memos', hasSystem: false, hasPlugin: true, services: [] }],
    ...(received ? { receivedEventTypes: received } : {}),
  })} };`);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-declarations-'));
  origEnv = { env: process.env.ABUDDY_ENV, userDataDir: process.env.ABUDDY_USER_DATA_DIR };
  process.env.ABUDDY_ENV = 'test';
  process.env.ABUDDY_USER_DATA_DIR = tmpDir;
});

afterEach(() => {
  try { registry.unregisterPack(PACK_ID); } catch { /* not registered */ }
  for (const [key, value] of [['ABUDDY_ENV', origEnv.env], ['ABUDDY_USER_DATA_DIR', origEnv.userDataDir]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Where a pack came from is the app's knowledge, not the pack's: a pack's own generated registration can
// see neither its `abuddy.json` nor the directory it was installed into. The registry keeps it beside the
// registration so both come and go together.
describe('where the registry says a pack came from', () => {
  it('records an external pack\'s manifest and directory, and drops them when it unregisters', () => {
    installDeclaringPack({ memos: RECEIVED });

    expect(registerExternalPacks(registry, loadExternalPacks())).toHaveLength(1);

    const origin = registry.packOrigin(PACK_ID);
    expect(origin).toMatchObject({ id: PACK_ID, name: 'Declaring Pack', version: '1.0.0', builtIn: false });
    expect(origin?.dir).toBe(path.join(tmpDir, 'packs', PACK_ID));
    expect(origin?.manifest?.id).toBe(PACK_ID);
    expect(registry.externalPacks().map((o) => o.id)).toContain(PACK_ID);
    expect(registry.builtInPacks().map((o) => o.id)).not.toContain(PACK_ID);

    registry.unregisterPack(PACK_ID);
    expect(registry.packOrigin(PACK_ID)).toBeNull();
    expect(registry.externalPacks().map((o) => o.id)).not.toContain(PACK_ID);
  });
});

describe('the event types an external pack declares for its plugins', () => {
  it('reach the validation map the bus checks sends against', () => {
    installDeclaringPack({ memos: RECEIVED });

    expect(registerExternalPacks(registry, loadExternalPacks())).toHaveLength(1);

    expect(registry.getPluginEventValidationMap().get('memos')).toEqual(new Set(RECEIVED));
  });

  // The fallback that hides a lost declaration: `features` says which plugins are the pack's own, so the id
  // is known either way, and only the value tells "declared nothing" from "declared these"
  it('are null, not absent, for a pack too old to declare them', () => {
    installDeclaringPack(undefined);

    expect(registerExternalPacks(registry, loadExternalPacks())).toHaveLength(1);

    const map = registry.getPluginEventValidationMap();
    expect(map.has('memos')).toBe(true);
    expect(map.get('memos')).toBeNull();
  });
});
