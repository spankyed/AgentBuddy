// A vitest global setup module (isolatedDataDir().globalSetup): removes the run's data dir when the run ends.
import * as fs from 'node:fs';

export default function setup(project: { config: { env?: Record<string, string | undefined> } }) {
  const dir = project.config.env?.ABUDDY_USER_DATA_DIR;
  return () => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  };
}
