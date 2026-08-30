import { getHostModule } from '../runtime/host';

let _mod: any;
function mod() {
  if (!_mod) _mod = getHostModule('relation-index');
  return _mod;
}

export const relationIndex: any = new Proxy({} as any, {
  get(_, prop: string) { return mod().relationIndex[prop]; },
});
