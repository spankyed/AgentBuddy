import * as fs from 'node:fs';
import * as path from 'node:path';

const hostInfoFile = (userDataDir: string) => path.join(userDataDir, 'host.json');

/**
 * Records the AgentBuddy version starting with this data dir, so tools that install packs into
 * it without running the app (abuddy install) can check a pack's hostVersion.
 */
export function recordHostVersion(userDataDir: string, version: string): void {
  if (readHostVersion(userDataDir) === version) return;
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(hostInfoFile(userDataDir), JSON.stringify({ version }, null, 2) + '\n');
}

/** The AgentBuddy version that last started with this data dir, if one has. */
export function readHostVersion(userDataDir: string): string | undefined {
  try {
    const { version } = JSON.parse(fs.readFileSync(hostInfoFile(userDataDir), 'utf-8'));
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}
