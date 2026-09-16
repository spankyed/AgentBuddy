// A vitest global setup module (isolatedDataDir().globalSetup): gives the test workers the project's root, where
// the harness looks for the pack, and removes the run's data dir when the run ends.
import * as fs from 'node:fs';

/** The `inject` key under which workers find the vitest project's root (`--root`, `test.root`, a workspace project's dir) */
export const PROJECT_ROOT_KEY = 'abuddyProjectRoot';

export default function setup(project: {
  config: { root: string; env?: Record<string, string | undefined> };
  provide(key: string, value: unknown): void;
}) {
  project.provide(PROJECT_ROOT_KEY, project.config.root);
  const dir = project.config.env?.ABUDDY_USER_DATA_DIR;
  return () => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  };
}
