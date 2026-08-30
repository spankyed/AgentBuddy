/**
 * EARS runtime delegates.
 *
 * These are singleton functions initialized by the host (api) at boot.
 * Features import these from @abuddy/sdk/ears and they delegate
 * to the real LMDB-backed implementation.
 *
 * Usage:
 *   // Host (api/src/setup/backend.ts):
 *   import { initEARSRuntime } from '@abuddy/sdk/ears';
 *   initEARSRuntime({ qx, tx, createEntity });
 *
 *   // Feature (default-setup/src/features/calendar/repository/read.ts):
 *   import { qx } from '@abuddy/sdk/ears';
 *   const events = qx().findAll(EARS.CalendarEvent);
 */

// biome-ignore lint/suspicious/noExplicitAny: runtime delegates accept any signature
type AnyFn = (...args: any[]) => any;

let _qx: AnyFn | null = null;
let _tx: AnyFn | null = null;
let _createEntity: AnyFn | null = null;

export interface EARSRuntimeDeps {
  qx: AnyFn;
  tx: AnyFn;
  createEntity: AnyFn;
}

export function initEARSRuntime(deps: EARSRuntimeDeps) {
  _qx = deps.qx;
  _tx = deps.tx;
  _createEntity = deps.createEntity;
}

function ensureInit(name: string, fn: AnyFn | null): AnyFn {
  if (!fn) throw new Error(`EARS runtime not initialized. Call initEARSRuntime() before using ${name}().`);
  return fn;
}

export function qx(...args: any[]) {
  return ensureInit('qx', _qx)(...args);
}

export function tx(...args: any[]) {
  return ensureInit('tx', _tx)(...args);
}

export function createEntity(...args: any[]) {
  return ensureInit('createEntity', _createEntity)(...args);
}

export interface SafeLinkOptions {
  info?: unknown;
  symmetric?: boolean;
  acyclicGroup?: readonly string[];
}
