import { getHostModule } from '../runtime/host';

let _mod: any;
function mod() {
  if (!_mod) _mod = getHostModule('edge-store');
  return _mod;
}

export const edgeStore: any = new Proxy({} as any, {
  get(_, prop: string) { return mod().edgeStore[prop]; },
});
