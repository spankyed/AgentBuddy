import { expect, it } from 'vitest';
import { compilationConditions } from '../../src/build/compilation-inputs.ts';

it('normalizes equivalent launch paths while retaining custom export selectors', () => {
  expect(compilationConditions(['--require', '/test-loader.js', '--conditions=custom', '-C', 'custom'],
    '--import /other-loader.js --conditions="@apackdev/source" --conditions="custom with space"'))
    .toEqual(['custom', 'custom with space']);
  expect(compilationConditions([], '--conditions=@apackdev/source')).toEqual(compilationConditions([], ''));
});
