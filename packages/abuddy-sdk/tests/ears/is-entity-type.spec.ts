// isEntityType answers from the running app's registered entity types, so a pack's step or action can check any
// registered pack's types, not only the ones its own generated facade knows
import { afterAll, describe, expect, it } from 'vitest';
import { isEntityType } from '../../src/ears/index.ts';
import { getEntityTypeChecker, initEARSRuntime } from '../../src/ears/runtime.ts';

const previous = getEntityTypeChecker();
afterAll(() => initEARSRuntime({ isEntityType: previous }));

describe('isEntityType', () => {
  it("follows the runtime's registered entity types", () => {
    initEARSRuntime({ isEntityType: (name) => name === 'Note' || name === 'Memo' });
    expect(isEntityType('Memo')).toBe(true);
    expect(isEntityType('Nope')).toBe(false);
    initEARSRuntime({ isEntityType: (name) => name === 'Note' });
    expect(isEntityType('Memo')).toBe(false);
  });
});
