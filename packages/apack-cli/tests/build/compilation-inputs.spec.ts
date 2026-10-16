import { expect, it } from 'vitest';
import { compilationConditions } from '../../src/build/compilation-inputs.ts';

it('normalizes equivalent launch paths while retaining custom export selectors', () => {
  expect(compilationConditions(['--require', '/test-loader.js', '--conditions=custom', '-C', 'custom'],
    '--import /other-loader.js --conditions="@apackdev/source" --conditions="custom with space"'))
    .toEqual(['custom', 'custom with space']);
  expect(compilationConditions([], '--conditions=@apackdev/source')).toEqual(compilationConditions([], ''));
});


it('preserves literal single quotes and unquoted backslashes in environment selectors', () => {
  expect(compilationConditions([], String.raw`--conditions='two words' --conditions=back\slash`))
    .toEqual(["'two", String.raw`back\slash`]);
});
