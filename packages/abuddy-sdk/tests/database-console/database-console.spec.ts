// The Database console's code runners, which the Database plugin and `abuddy db query`/`exec` share
import * as os from 'node:os';
import { beforeEach, describe, expect, it } from 'vitest';
import { tx, untypedQx } from '@abuddy/ears';
import { consoleEars, getSchemaStats, installedEars, READ_HELPER_NAMES, runQueryCode, runTransactionCode, WRITE_HELPER_NAMES } from '../../src/database-console/index.ts';
import { testPacks } from '../../src/testing/packs.ts';
import { EARS } from '../../src/types/index.ts';
import { resetTestData, startTestRuntime } from '../../src/testing/index.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime();

beforeEach(() => resetTestData());

const scope = { EARS: { Entity: { Flow: 'Flow' }, RelKind: {} } };

describe('the helpers console code sees', () => {
  // Spelled out, so adding or moving one is a deliberate change: the Database console, the `query` flow step and
  // `abuddy db query`/`exec` all rest on what a query can and cannot reach
  it('gives a query these, and nothing that writes', async () => {
    expect([...READ_HELPER_NAMES].sort()).toEqual([
      'findRelations', 'getAll', 'getAllEntities', 'getAttr', 'getAttrs', 'getEntitiesOfType', 'getRelationStats',
      'getRoles', 'getSchemaStats', 'queryEntitiesByAttribute', 'queryEntitiesByRelationTo',
      'queryEntitiesInRelationTo', 'qx',
    ]);
    for (const name of READ_HELPER_NAMES) {
      await expect(runQueryCode(`return typeof ${name}`, scope), name).resolves.toBe('function');
    }
  });

  it('gives a transaction the write helpers as well', async () => {
    expect([...WRITE_HELPER_NAMES].sort()).toEqual([
      'createEntityWithDefaults', 'createRelation', 'destroyEntity', 'grantRole', 'prepareEntity', 'removeRelation',
      'removeRelationById', 'revokeRole', 'tx', 'updateEntity',
    ]);
    for (const name of [...READ_HELPER_NAMES, ...WRITE_HELPER_NAMES]) {
      await expect(runTransactionCode(`return typeof ${name}`, scope), name).resolves.toBe('function');
    }
  });
});

describe('runQueryCode', () => {
  it('returns what the code returns, reading the installed engine and the EARS it is given', async () => {
    tx('Flow-1' as never, true).put('entityType', 'Flow').put('label', 'Main');
    await expect(runQueryCode("return qx(EARS.Entity.Flow).pickAll().map((f) => f.label)", scope)).resolves.toEqual(['Main']);
    await expect(runQueryCode('return getAttr("Flow-1", "label")', scope)).resolves.toBe('Main');
    await expect(runQueryCode('return getSchemaStats().entities', scope)).resolves.toEqual({ Flow: 1 });
  });

  it("can't write: every write helper is undefined, and the error is the code's", async () => {
    for (const name of WRITE_HELPER_NAMES) {
      await expect(runQueryCode(`return ${name}`, scope)).rejects.toThrow(new Error(`${name} is not defined`));
    }
    expect(untypedQx('Flow').ids()).toEqual([]);
  });

  it('refuses blank code rather than answering undefined', async () => {
    // Whitespace alone is a function body that returns nothing, which would read as a query that found nothing
    for (const blank of ['', '   ', '\n\t ']) {
      await expect(runQueryCode(blank, scope)).rejects.toThrow('No code to run');
      await expect(runTransactionCode(blank, scope)).rejects.toThrow('No code to run');
    }
  });
});

describe('runTransactionCode', () => {
  it('writes with the write helpers and reads with the read helpers', async () => {
    const id = await runTransactionCode("const id = tx(EARS.Entity.Flow).put('label', 'New').id(); return getAttr(id, 'label')", scope);
    expect(id).toBe('New');
    expect(untypedQx('Flow').ids()).toHaveLength(1);
  });

  it('prefixes its error', async () => {
    await expect(runTransactionCode('throw new Error("boom")', scope)).rejects.toThrow(new Error('Transaction failed: boom'));
  });

  it('awaits a returned promise', async () => {
    await expect(runTransactionCode('return Promise.resolve(3)', scope)).resolves.toBe(3);
  });
});

describe('getSchemaStats', () => {
  it('counts entities, attribute kinds and relation kinds', () => {
    tx('Flow-1' as never, true).put('entityType', 'Flow').put('label', 'a');
    tx('Flow-2' as never, true).put('entityType', 'Flow').put('label', 'b').link('contains', 'Flow-1' as never);
    const stats = getSchemaStats();
    expect(stats.entities.Flow).toBe(2);
    expect(stats.attributes.label).toEqual({ entityCount: 2, totalValues: 2 });
    expect(stats.relations.contains).toEqual({ totalRelations: 1, uniqueSources: 1, uniqueTargets: 1 });
  });
});

// Console code queries the whole database, so it names every installed pack's entity types, whichever pack runs the
// console: the Database plugin and `abuddy db` read the same names
describe('the EARS console code sees', () => {
  it("adds the packs' entity types and relation kinds to the SDK's, keeping the SDK's own", () => {
    const ears = consoleEars({ entities: { Memo: 'Memo' }, relKinds: { mentions: 'mentions' } }) as
      { Entity: Record<string, string>; RelKind: Record<string, string> };

    expect(ears.Entity).toMatchObject({ Memo: 'Memo', Flow: 'Flow' });
    expect(ears.RelKind).toMatchObject({ mentions: 'mentions', Custom: EARS.RelKind.Custom });
  });

  it("names a registered pack's entity type, not only the pack whose console it is", async () => {
    const ears = installedEars() as { Entity: Record<string, string> };
    expect(ears.Entity.Flow).toBe('Flow');

    // Another installed pack's type, as its registration declares it
    startTestRuntime({ entityTypes: ['Memo', 'Note'] });
    testPacks.earsEntities.set('Memo', 'Memo');
    tx('Memo-1' as EARS.EntityId, true).put('title', 'theirs');
    tx('Note-1' as EARS.EntityId, true).put('title', 'ours');

    await expect(runQueryCode('return EARS.Entity.Memo', { EARS: installedEars() })).resolves.toBe('Memo');
    // A name the console doesn't know reads as undefined, which queries everything, so the ids say which it was
    await expect(runQueryCode('return qx(EARS.Entity.Memo).ids()', { EARS: installedEars() }))
      .resolves.toEqual(['Memo-1']);
  });
});
