// _shortCodeTypes: a short code's entity type, from the row rules holding each type's prefix
import { expect, it } from 'vitest';
import { _shortCodeTypes } from '../../src/framework/data-declaration.ts';
import { SDK_ROW_RULES } from '../../src/types/sdk-entities.ts';

const typeOf = _shortCodeTypes([...Object.entries(SDK_ROW_RULES), ['Thread', { shortCode: 'THR' }], ['Message', {}]]);

it("answers the type that numbers a code's prefix, the SDK's and a pack's alike", () => {
  expect([typeOf('THR-41'), typeOf('DOC-1'), typeOf('FLW-12'), typeOf('PRM-3')]).toEqual(['Thread', 'Document', 'Flow', 'Prompt']);
});

it("answers nothing for a code that isn't <prefix>-<n>, or whose prefix no type numbers with", () => {
  for (const code of ['THR', 'THR-', 'THR-0', 'THR-04', 'THR-4a', '-4', 'thr-4', 'XYZ-1', 'MSG-1', '']) {
    expect(typeOf(code), code).toBeUndefined();
  }
  expect(typeOf(41 as unknown as string)).toBeUndefined();
});
