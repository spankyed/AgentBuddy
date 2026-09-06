import { getHostModule } from '../runtime/host';

let _trpcMod: any;
function trpcMod() {
  if (!_trpcMod) _trpcMod = getHostModule('trpc');
  return _trpcMod;
}

export const trpc: any = new Proxy({} as any, {
  get(_, prop: string) { return trpcMod().trpc[prop]; },
});

let _busMod: any;
function busMod() {
  if (!_busMod) _busMod = getHostModule('bus-emitter');
  return _busMod;
}

export const rootEvents: any = new Proxy({} as any, {
  get(_, prop: string) {
    const real = busMod().rootEvents;
    const value = real[prop];
    if (typeof value === 'function') return value.bind(real);
    return value;
  },
});

let _eventsMod: any;
function eventsMod() {
  if (!_eventsMod) _eventsMod = getHostModule('router-events');
  return _eventsMod;
}

export type IncomingSystemEvents = any;
