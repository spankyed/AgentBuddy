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
  // Written aside and renamed, so a crash never leaves a truncated host.json
  const file = hostInfoFile(userDataDir);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ version }, null, 2) + '\n');
  fs.renameSync(temp, file);
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
