import { getHostModule } from '../runtime/host';

let _emitterMod: any;
function emitterMod() { if (!_emitterMod) _emitterMod = getHostModule('event-emitter'); return _emitterMod; }

export function sendToPlugin(...args: any[]) { return emitterMod().sendToPlugin(...args); }
export function sendToBrainSystem(...args: any[]) { return emitterMod().sendToBrainSystem(...args); }

let _claudeCodeMod: any;
function claudeCodeMod() { if (!_claudeCodeMod) _claudeCodeMod = getHostModule('claude-code'); return _claudeCodeMod; }

export const claudeCode: any = new Proxy({} as any, {
  get(_, prop: string) { return claudeCodeMod().claudeCode[prop]; },
});

let _servicesMod: any;
function servicesMod() { if (!_servicesMod) _servicesMod = getHostModule('services'); return _servicesMod; }

export const services: any = new Proxy({} as any, {
  get(_, prop: string) { return servicesMod()[prop]; },
});
