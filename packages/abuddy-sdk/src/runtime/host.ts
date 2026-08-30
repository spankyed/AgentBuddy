type AnyFn = (...args: any[]) => any;

const _modules = new Map<string, any>();

export function registerHostModule(key: string, mod: unknown): void {
  _modules.set(key, mod);
}

export function getHostModule<T = any>(key: string): T {
  const mod = _modules.get(key);
  if (!mod) throw new Error(`SDK host module "${key}" not registered. Call registerHostModule("${key}", ...) at boot.`);
  return mod;
}

export function hostFn(moduleKey: string, fnName: string): AnyFn {
  return (...args: any[]) => {
    const mod = _modules.get(moduleKey);
    if (!mod) throw new Error(`SDK host module "${moduleKey}" not registered.`);
    const fn = mod[fnName];
    if (typeof fn !== 'function') throw new Error(`"${fnName}" is not a function on host module "${moduleKey}".`);
    return fn(...args);
  };
}

export function hostValue<T = any>(moduleKey: string, name: string): T {
  const mod = _modules.get(moduleKey);
  if (!mod) throw new Error(`SDK host module "${moduleKey}" not registered.`);
  return mod[name] as T;
}
