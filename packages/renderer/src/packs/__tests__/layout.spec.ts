// The Packs view renders; it decides nothing about packs. Its machine, the pack-frontend loading it drives and the
// install request all live in `@abuddy/host/fe`, beside the `host/packs` system that answers them, the way the API
// holds no app runtime (`packages/api/tests/unit/source-layout.spec.ts`). This says what may sit here, in the
// package it constrains: the host's own boundaries spec reads the host's tree only, and neither reaches into the other.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const PACKS = path.resolve(import.meta.dirname, '..');

/** Every file under src/packs, by its path from there */
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : [path.relative(PACKS, full).split(path.sep).join('/')];
  });
}

describe('packages/renderer/src/packs', () => {
  it('holds the view and one composition module, and nothing that decides anything about packs', () => {
    const source = files(PACKS).filter((f) => !f.startsWith('__tests__/'));
    const composition = source.filter((f) => !f.endsWith('.vue'));

    expect(source.filter((f) => f.endsWith('.vue')).length, 'the Packs view').toBeGreaterThan(0);
    expect(composition, 'a machine, a loader or a request belongs in @abuddy/host/fe, beside the packs system')
      .toEqual(['plugin.ts']);
  });

  it("defines no state machine here: the machine is the host's", () => {
    // A view reads its actor with useSelector, which is rendering; creating one is deciding
    const defining = files(PACKS)
      .filter((f) => !f.startsWith('__tests__/'))
      .filter((f) => /createMachine|from 'xstate'/.test(fs.readFileSync(path.join(PACKS, f), 'utf-8')));

    expect(defining, "the Packs machine is @abuddy/host/fe's").toEqual([]);
  });
});
