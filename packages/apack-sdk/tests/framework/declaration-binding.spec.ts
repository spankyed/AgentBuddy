import { describe, expect, it } from 'vitest';
import { _packDeclarationProblem } from '../../src/framework/declaration-binding.ts';

const expected = { id: 'example', declarationRevision: 'current' };

describe('pack declaration binding', () => {
  it('accepts matching bindings with arbitrary executable contributions', () => {
    expect(_packDeclarationProblem(expected, { ...expected, features: {} })).toBeUndefined();
  });

  it.each([null, undefined, 1, 'example', {}])('refuses missing registrations: %j', binding => {
    expect(_packDeclarationProblem(expected, binding)).toBeDefined();
  });

  it('refuses another owner even when its revision matches', () => {
    expect(_packDeclarationProblem(expected, { ...expected, id: 'other' })).toContain('another pack');
  });

  it.each([undefined, 'previous'])('refuses stale or absent declaration identities: %j', declarationRevision => {
    expect(_packDeclarationProblem(expected, { ...expected, declarationRevision })).toContain('rebuild');
  });
});
