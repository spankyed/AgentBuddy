import { getHostModule } from '../runtime/host';

let _mod: any;
function mod() {
  if (!_mod) _mod = getHostModule('logger');
  return _mod;
}

export function createLogger(...args: any[]) { return mod().createLogger(...args); }

export function getLogEvent() { return mod().LogEvent; }
export const LogEvent: any = new Proxy({} as any, {
  get(_, prop: string) { return mod().LogEvent[prop]; },
});
