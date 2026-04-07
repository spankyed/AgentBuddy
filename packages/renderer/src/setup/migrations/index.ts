/**
 * Frontend pre-actor migration runner.
 *
 * Runs in main.ts BEFORE the application actor is created, so it can
 * update localStorage keys that are read during actor context initialization
 * (agentbuddy-panel-sizes, agentbuddy-last-active-plugin).
 *
 * Mirrors the backend migration pattern: separate versioned files,
 * imported and registered here, executed in version order.
 */

declare const __APP_VERSION__: string;

export interface FrontendMigration {
  version: string;
  description: string;
  up: () => void;
}

const VERSION_KEY = 'agentbuddy-fe-version';

// Register migrations in version order
// import { migration as m004 } from './0.0.4';

const migrations: FrontendMigration[] = [];

export function runFrontendMigrations(): void {
  const current = localStorage.getItem(VERSION_KEY) || '0.0.0';

  for (const m of migrations) {
    if (m.version > current) {
      console.log(`[frontend-migration] Running ${m.version}: ${m.description}`);
      m.up();
    }
  }

  if (current !== __APP_VERSION__) {
    localStorage.setItem(VERSION_KEY, __APP_VERSION__);
  }
}
