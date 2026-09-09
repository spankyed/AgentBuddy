const shutdownHooks: Array<() => void> = [];

export function registerShutdownHook(hook: () => void): void {
  shutdownHooks.push(hook);
}

export function runShutdownHooks(): void {
  for (const hook of shutdownHooks) {
    try { hook(); } catch {}
  }
}
