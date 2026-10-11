// Carrying a reused phase's reads forward, which is what keeps the record whole when a build is cheapest.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_READS_FILE } from '@apack/host/build/pack-workdir';
import { buildReads } from '../../src/build/build-reads';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'apack-build-reads-'));
}

describe('carry', () => {
  it('keeps the previous build\'s reads for a phase this build reused, bundlers included', () => {
    const pack = tmp();
    // The file has to be there: the writer realpaths every read, so one that has gone is dropped — and a
    // source that has gone moves the phase's hash anyway, so a carried read always names a file that exists
    fs.mkdirSync(path.join(pack, 'src'), { recursive: true });
    fs.writeFileSync(path.join(pack, 'src', 'a.ts'), 'export const a = 1');
    fs.mkdirSync(path.join(pack, '.apack'), { recursive: true });
    fs.writeFileSync(path.join(pack, PACK_READS_FILE), JSON.stringify({
      bundlers: { vite: '7.0.0' }, phases: { fe: ['src/a.ts'] },
    }));

    const reads = buildReads(pack)!;
    expect(reads.carry('fe')).toBe(true);
    reads.write();

    const written = JSON.parse(fs.readFileSync(path.join(pack, PACK_READS_FILE), 'utf-8'));
    expect(written.phases.fe).toEqual(['src/a.ts']);
    expect(written.bundlers).toEqual({ vite: '7.0.0' });
  });

  it('says there is nothing to carry, which is the caller\'s cue to run the phase', () => {
    expect(buildReads(tmp())!.carry('fe')).toBe(false);
  });
});
