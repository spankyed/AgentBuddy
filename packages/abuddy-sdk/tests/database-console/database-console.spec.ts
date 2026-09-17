// The Database console's code runners, which the Database plugin and `abuddy db query`/`exec` share
import * as os from 'node:os';
import { beforeEach, describe, expect, it } from 'vitest';
import { tx, untypedQx } from '@abuddy/ears';
import { getSchemaStats, runQueryCode, runTransactionCode, WRITE_HELPER_NAMES } from '../../src/database-console/index.ts';
import { resetTestData, startTestRuntime } from '../../src/testing/index.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime();

beforeEach(() => resetTestData());

const scope = { EARS: { Entity: { Flow: 'Flow' }, RelKind: {} } };

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

  it('refuses no code', async () => {
    await expect(runQueryCode('', scope)).rejects.toThrow('No code to run');
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
