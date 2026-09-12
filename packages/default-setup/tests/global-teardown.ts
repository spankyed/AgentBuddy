import * as fs from 'node:fs';
import type { TestProject } from 'vitest/node';

/** Removes the per-run data dir created in vitest.config.ts. */
export default function setup(project: TestProject) {
  const dir = project.config.env?.ABUDDY_USER_DATA_DIR;
  return () => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  };
}
