// Carrying a reused phase's reads forward, which is what keeps the record whole when a build is cheapest.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACK_READS_FILE } from '@apackdev/host/build/pack-workdir';
import { buildReads } from '../../src/build/build-reads';
import { COMPILER_INPUTS_ENV } from '../../src/build/compiler-installation.ts';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

function tmp(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-build-reads-'));
  roots.push(root);
  return root;
}

it('records captured compiler files by source origin without reading the original file', () => {
  const pack = tmp(), captured = tmp();
  const input = path.join(captured, 'types.ts');
  fs.writeFileSync(input, 'export type Captured = string;');
  const inputsFile = path.join(captured, 'compiler-inputs.json');
  fs.writeFileSync(inputsFile, JSON.stringify({ hash: '0'.repeat(64), packages: [], paths: [{ captured: fs.realpathSync(captured), source: fs.realpathSync(pack) }] }));
  vi.stubEnv(COMPILER_INPUTS_ENV, inputsFile);
  const reads = buildReads(pack)!;
  reads.forPhase('types')({ bundler: 'rollup', version: '1', files: [input] });
  reads.write();
  expect(JSON.parse(fs.readFileSync(path.join(pack, PACK_READS_FILE), 'utf8')).phases.types).toEqual(['types.ts']);
  expect(fs.existsSync(path.join(pack, 'types.ts'))).toBe(false);
});

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
