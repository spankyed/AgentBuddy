import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBRARY_NAMES, NOTES_NAMES } from '../../src/seed/built-in-names.ts';
import { SDK_REL_KINDS } from '../../src/types/sdk-entities.ts';

const manifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../default-setup/abuddy.json'), 'utf-8')) as {
  entities: Record<string, string>;
  relKinds: Record<string, string>;
};

describe("the seeders' built-in entity names", () => {
  it('match the entities default-setup declares and the relation kinds it or the SDK declares', () => {
    const relKinds = { ...manifest.relKinds, ...SDK_REL_KINDS };
    for (const names of [NOTES_NAMES, LIBRARY_NAMES]) {
      for (const [key, value] of Object.entries(names.Entity)) expect([key, manifest.entities[key]]).toEqual([key, value]);
      for (const [key, value] of Object.entries('RelKind' in names ? names.RelKind : {})) expect([key, relKinds[key as keyof typeof relKinds]]).toEqual([key, value]);
    }
  });
});
