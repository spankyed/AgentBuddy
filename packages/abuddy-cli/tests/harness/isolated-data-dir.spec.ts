import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isolatedDataDir } from '@abuddy/testing/vitest';

const PREFIX = `isolated-data-dir-spec-${process.pid}-`;
const created: string[] = [];

function dirFor(pid: number): string {
  const dir = path.join(os.tmpdir(), `${PREFIX}${pid}-abc123`);
  fs.mkdirSync(dir, { recursive: true });
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('isolatedDataDir', () => {
  it("removes data dirs left by runs that crashed, and keeps running processes' dirs", () => {
    const exited = spawnSync(process.execPath, ['-e', '']).pid!;
    const stale = dirFor(exited);
    const live = dirFor(process.pid);

    const { dir } = isolatedDataDir(PREFIX);
    created.push(dir);

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(live)).toBe(true);
    expect(path.basename(dir)).toMatch(new RegExp(`^${PREFIX}${process.pid}-`));
  });
});
