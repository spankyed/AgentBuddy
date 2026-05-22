/**
 * Central Repository — Dynamic Registry
 *
 * Systems self-register their queries/commands at import time.
 * Access pattern: repository.{system}Queries.{method}() or repository.{system}Commands.{method}()
 */

const entries: Record<string, any> = {};

/**
 * Register repository queries/commands under a namespace.
 * Called by each system's repository module at import time.
 */
export function registerRepository(name: string, value: any): void {
  entries[name] = value;
}

/**
 * Proxy-backed repository — delegates property access to the registry.
 * Consumer code (`repository.threadQueries.byId()`) is unchanged.
 */
export const repository = new Proxy({} as Record<string, any>, {
  get(_, prop: string) {
    return entries[prop];
  }
}) as any;

// Type export for better IDE support
export type Repository = typeof repository;
