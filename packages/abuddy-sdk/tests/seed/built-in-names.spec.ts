import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLOW_NAMES, LIBRARY_NAMES, NOTES_NAMES } from '../../src/seed/built-in-names.ts';

const manifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../default-setup/abuddy.json'), 'utf-8')) as {
  entities: Record<string, string>;
  relKinds: Record<string, string>;
};

describe("the seeders' built-in entity names", () => {
  it('match the entities and relation kinds default-setup declares', () => {
    for (const names of [FLOW_NAMES, NOTES_NAMES, LIBRARY_NAMES]) {
      for (const [key, value] of Object.entries(names.Entity)) expect([key, manifest.entities[key]]).toEqual([key, value]);
      for (const [key, value] of Object.entries('RelKind' in names ? names.RelKind : {})) expect([key, manifest.relKinds[key]]).toEqual([key, value]);
    }
  });
});
