const shutdownHooks = new Map<string, Array<() => void>>();

export function registerShutdownHook(hook: () => void, key?: string): void {
  const k = key ?? '_global';
  let hooks = shutdownHooks.get(k);
  if (!hooks) {
    hooks = [];
    shutdownHooks.set(k, hooks);
  }
  hooks.push(hook);
}

export function runShutdownHooks(): void {
  for (const hooks of shutdownHooks.values()) {
    for (const hook of hooks) {
      try { hook(); } catch {}
    }
  }
}

export function runShutdownHooksForKey(key: string): void {
  const hooks = shutdownHooks.get(key);
  if (!hooks) return;
  for (const hook of hooks) {
    try { hook(); } catch {}
  }
  shutdownHooks.delete(key);
}

export function removeShutdownHooksForKey(key: string): void {
  shutdownHooks.delete(key);
}
