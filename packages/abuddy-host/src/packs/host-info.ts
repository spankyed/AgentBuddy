import * as fs from 'node:fs';
import * as path from 'node:path';

const hostInfoFile = (userDataDir: string) => path.join(userDataDir, 'host.json');

/** What the AgentBuddy that last started with a data dir can load, for tools that install packs into it without it running */
export interface HostInfo {
  /** Its version, which a pack's `hostVersion` range is checked against */
  version?: string;
  /**
   * The pack snapshot format it reads (`PACK_SNAPSHOT_FORMAT`), which a pack's build must be in for it to load.
   * Absent when an AgentBuddy that doesn't record it last started with the data dir.
   */
  packFormat?: number;
}

/** Records what the AgentBuddy starting with this data dir can load, so `abuddy install` and `abuddy dev` can check a pack against it. */
export function recordHostInfo(userDataDir: string, info: Required<HostInfo>): void {
  const current = readHostInfo(userDataDir);
  if (current.version === info.version && current.packFormat === info.packFormat) return;
  fs.mkdirSync(userDataDir, { recursive: true });
  // Written aside and renamed, so a crash never leaves a truncated host.json
  const file = hostInfoFile(userDataDir);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ version: info.version, packFormat: info.packFormat }, null, 2) + '\n');
  fs.renameSync(temp, file);
}

/** What the AgentBuddy that last started with this data dir recorded, each field absent when nothing says */
export function readHostInfo(userDataDir: string): HostInfo {
  let recorded: { version?: unknown; packFormat?: unknown };
  try {
    recorded = JSON.parse(fs.readFileSync(hostInfoFile(userDataDir), 'utf-8')) ?? {};
  } catch {
    return {};
  }
  return {
    version: typeof recorded.version === 'string' ? recorded.version : undefined,
    packFormat: typeof recorded.packFormat === 'number' ? recorded.packFormat : undefined,
  };
}
