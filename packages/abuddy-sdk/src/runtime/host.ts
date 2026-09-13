const _modules = new Map<string, unknown>();

/** @internal Host-only: the api and renderer register the modules SDK delegates call. */
export function registerHostModule(key: string, mod: unknown): void {
  _modules.set(key, mod);
}

/** @internal Host-only: SDK delegates read the modules the host registered. */
export function getHostModule<T = unknown>(key: string): T {
  const mod = _modules.get(key);
  if (!mod) throw new Error(`SDK host module "${key}" not registered. Call registerHostModule("${key}", ...) at boot.`);
  return mod as T;
}

export function hostFn<TArgs extends unknown[] = unknown[], TResult = unknown>(moduleKey: string, fnName: string): (...args: TArgs) => TResult {
  return (...args: TArgs) => {
    const mod = _modules.get(moduleKey) as Record<string, unknown> | undefined;
    if (!mod) throw new Error(`SDK host module "${moduleKey}" not registered.`);
    const fn = mod[fnName];
    if (typeof fn !== 'function') throw new Error(`"${fnName}" is not a function on host module "${moduleKey}".`);
    return fn(...args) as TResult;
  };
}

export function hostValue<T = unknown>(moduleKey: string, name: string): T {
  const mod = _modules.get(moduleKey) as Record<string, unknown> | undefined;
  if (!mod) throw new Error(`SDK host module "${moduleKey}" not registered.`);
  return mod[name] as T;
}
