// The loader's lines are what `@abuddy/testing` reads to tell whether a pack came up — the only signal a
// backend-only pack leaves. A reword has to be a change to both sides, not a pack author's suite failing
// later with the wrong reason, so the sentences live in one module and this pins that the loader uses it.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registry } from './test-host.ts';
import { PACK_LOAD_MESSAGES, packRegistered } from '../../../src/packs/load-messages.ts';
import { registerExternalPacks } from '../../../src/packs/runtime/loader.ts';
import { testRootEvents } from '@abuddy/sdk/testing';

const PACK_ID = 'load-messages-pack';
let tmpDir: string;
let logged: string[];
let stopListening: () => void;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-messages-'));
  logged = [];
  stopListening = testRootEvents.onLog((event) => void logged.push(event.message));
});

afterEach(() => {
  stopListening();
  try { registry.unregisterPack(PACK_ID); } catch { /* not registered */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('what the loader says about a pack', () => {
  it('registers with the sentence the harness watches for', () => {
    const manifest = { id: PACK_ID, name: PACK_ID, version: '1.0.0' };
    const pack = {
      registration: { id: PACK_ID, systems: [] },
      origin: { ...manifest, dir: tmpDir, builtIn: false, manifest },
    };

    expect(registerExternalPacks(registry, [pack as never])).toHaveLength(1);

    expect(logged).toContain(packRegistered(PACK_ID, 0));
    // And the fragment the harness actually matches on is in it
    expect(logged.some((line) => line.startsWith(PACK_LOAD_MESSAGES.registered))).toBe(true);
  });
});
