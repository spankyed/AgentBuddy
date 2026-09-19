// `abuddy dev` state lives in the data dir, outside the installed (verified, replaced-on-install) pack
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAppContext } from '@abuddy/sdk/env';
import { verifyPack } from '../../src/packs/pack-layout.ts';
import { installPackFromLocal } from '../../src/packs/pack-installer.ts';
import {
  devServerMarkerPath,
  devServerUrl,
  removeDevServerMarker,
  writeDevServerMarker,
} from '../../src/packs/dev-server.ts';

let tmp: string;
let userDataDir: string;
let packsDir: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-spec-'));
  ({ userDataDir, packsDir } = resolveAppContext({ env: 'test', userDataDir: path.join(tmp, 'data') }));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A pack source dir as `abuddy build` leaves it. */
function builtPack(): string {
  const root = path.join(tmp, 'src-pack');
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  write('abuddy.json', JSON.stringify({ id: 'demo-pack', name: 'Demo Pack', version: '1.2.3' }));
  write('dist/runtime/index.cjs', 'module.exports = { registration: { id: "demo-pack", systems: [] } };');
  write('dist/runtime/fe.js', 'export default {};');
  write('dist/types/snapshot.json', '{"types":{}}');
  return root;
}

describe('dev server marker', () => {
  it('lives in the data dir, outside the packs dir', () => {
    const file = writeDevServerMarker(userDataDir, 'demo-pack', { port: 5199, pid: 42 });
    expect(file).toBe(devServerMarkerPath(userDataDir, 'demo-pack'));
    expect(path.relative(packsDir, file).startsWith('..')).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ port: 5199, pid: 42 });
  });

  it("gives the pack:// handler the dev server URL while the marker exists", () => {
    expect(devServerUrl(userDataDir, 'demo-pack', '/runtime/fe.js')).toBeNull();
    writeDevServerMarker(userDataDir, 'demo-pack', { port: 5200, pid: 42 });
    expect(devServerUrl(userDataDir, 'demo-pack', '/runtime/fe.js')).toBe('http://localhost:5200/runtime/fe.js');
    expect(devServerUrl(userDataDir, 'other-pack', '/runtime/fe.js')).toBeNull();
    removeDevServerMarker(userDataDir, 'demo-pack');
    expect(devServerUrl(userDataDir, 'demo-pack', '/runtime/fe.js')).toBeNull();
  });

  it('rejects a marker without a valid port', () => {
    fs.mkdirSync(path.dirname(devServerMarkerPath(userDataDir, 'demo-pack')), { recursive: true });
    fs.writeFileSync(devServerMarkerPath(userDataDir, 'demo-pack'), JSON.stringify({ port: 70000 }));
    expect(() => devServerUrl(userDataDir, 'demo-pack', '/runtime/fe.js')).toThrow(/port 70000/);
  });

  it('leaves an installed pack verifiable, and survives the reinstalls abuddy dev runs', async () => {
    const { dir } = await installPackFromLocal(builtPack(), packsDir);
    writeDevServerMarker(userDataDir, 'demo-pack', { port: 5199, pid: 42 });

    expect(verifyPack(dir).id).toBe('demo-pack');

    await installPackFromLocal(builtPack(), packsDir);
    expect(verifyPack(dir).id).toBe('demo-pack');
    expect(devServerUrl(userDataDir, 'demo-pack', '/runtime/fe.js')).toBe('http://localhost:5199/runtime/fe.js');
  });
});
