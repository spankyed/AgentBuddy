import { getHostModule } from '../runtime/host';
import type { Logger } from '../ears/runtime';

let _mod: any;
function mod() {
  if (!_mod) _mod = getHostModule('logger');
  return _mod;
}

export type { Logger };

export function createLogger(source?: string): Logger {
  return mod().createLogger(source);
}

export const LogEvent: any = new Proxy({} as any, {
  get(_, prop: string) { return mod().LogEvent[prop]; },
});
