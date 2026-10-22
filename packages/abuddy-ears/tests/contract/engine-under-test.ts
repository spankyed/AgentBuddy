// The engine the contract specs run against. The specs only reach it through this file, so the same
// specs covered the module-level engine (before Phase 6) and cover the engine instance.
// SPIKE: EARS_ENGINE=disk runs them against the LMDB-only engine (src/lmdb/disk-engine.ts), one environment per
// engine in a temp dir; EARS_DISK_CACHE=1 turns on lmdb-js's value cache, EARS_DISK_INDEX=0 the value index off.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll } from 'vitest';
import { createEarsEngine, type EarsEngine, type PersistenceSink } from '../../src/index.ts';
import { createDiskEarsEngine, type DiskEngine } from '../../src/lmdb/disk-engine.ts';

export interface EngineUnderTestOptions {
  isEntityType: (name: string) => boolean;
  persistence?: PersistenceSink;
}

export const DISK = process.env.EARS_ENGINE === 'disk';

let root: string | undefined;
const opened: DiskEngine[] = [];

if (DISK) {
  afterAll(async () => {
    for (const e of opened.splice(0)) await e.close();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
  });
}

export function freshDiskEngine(options: EngineUnderTestOptions & { cache?: boolean; noSync?: boolean; valueIndex?: boolean; encoding?: 'msgpack' | 'json' }): DiskEngine {
  root ??= fs.mkdtempSync(path.join(os.tmpdir(), 'ears-disk-'));
  const e = createDiskEarsEngine({
    path: fs.mkdtempSync(path.join(root, 'env-')),
    cache: process.env.EARS_DISK_CACHE === '1',
    noSync: process.env.EARS_DISK_NOSYNC === '1',
    valueIndex: process.env.EARS_DISK_INDEX !== '0',
    indexThreshold: process.env.EARS_DISK_THRESHOLD ? Number(process.env.EARS_DISK_THRESHOLD) : undefined,
    ...options,
  });
  opened.push(e);
  return e;
}

export function freshEngine(options: EngineUnderTestOptions): EarsEngine {
  return DISK ? freshDiskEngine(options) : createEarsEngine(options);
}

export type EngineUnderTest = EarsEngine;
