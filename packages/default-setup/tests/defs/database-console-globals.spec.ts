// What the Database console's editor types and what its code actually gets are one list: the manifest's
// dsl.database.globals, the defs module behind it (src/defs/database.ts) and the runners' helper sets
// (@abuddy/sdk/database-console) must name the same things.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSchemaStats, READ_HELPER_NAMES, WRITE_HELPER_NAMES } from '@abuddy/sdk/database-console';
import * as defs from '../../src/defs/database';

const manifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'abuddy.json'), 'utf-8'));
const globals: Record<string, string> = manifest.dsl.database.globals;
const provided = ['EARS', ...READ_HELPER_NAMES, ...WRITE_HELPER_NAMES].sort();

describe('the Database console globals', () => {
  it('are exactly what the console runners provide', () => {
    expect(Object.keys(globals).sort()).toEqual(provided);
  });

  it('each come from the defs module the editor loads', () => {
    for (const [name, type] of Object.entries(globals)) {
      expect(type, name).toBe(`typeof _dsl.${name}`);
      expect(Object.keys(defs), name).toContain(name);
    }
  });

  it("type getSchemaStats as the console's own, not the engine's narrower one", () => {
    // @abuddy/ears exports a function of the same name whose counts are plain numbers; the editor would then
    // reject `getSchemaStats().attributes.label.totalValues`, which works
    expect(defs.getSchemaStats).toBe(getSchemaStats);
  });

  it('leave nothing in the defs module that console code cannot use', () => {
    // Types disappear at runtime, so only values are compared
    expect(Object.keys(defs).sort()).toEqual(provided);
  });
});
