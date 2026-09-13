import { getHostModule } from '../runtime/host.js';

let _trpcMod: any;
function trpcMod() {
  if (!_trpcMod) _trpcMod = getHostModule('trpc');
  return _trpcMod;
}

export const trpc: any = new Proxy({} as any, {
  get(_, prop: string) { return trpcMod().trpc[prop]; },
});

// Assigned by initRpc() — must not be a Proxy, because a get-only Proxy
// breaks EventEmitter's internal _eventsCount bookkeeping (writes to the
// proxy target instead of the real instance, causing all listeners to be
// wiped on unsubscribe). ESM live bindings ensure importers see the real
// instance after init.
export let rootEvents: any;

/** @internal Host-only: the host wires the RPC client at boot. */
export function initRpc() {
  rootEvents = getHostModule('bus-emitter').rootEvents;
}

export type IncomingSystemEvents = any;
