import { describe, expect, it } from 'vitest';
import { population } from '../../src/testing/population.ts';

describe('population', () => {
  it('hands back what it was given, so it reads inline before the assertion it guards', () => {
    const files = ['a.ts', 'b.ts'];

    expect(population('two files', files)).toEqual(files);
  });

  it('refuses an empty subject, naming it — the case it exists to stop passing', () => {
    expect(() => population('the scaffold templates', []))
      .toThrow(/the scaffold templates: found 0, expected at least 1/);
  });

  it('refuses a subject that collapsed without reaching zero, which a bare emptiness test would let through', () => {
    expect(() => population('the published declarations', ['one.d.ts'], { atLeast: 100 }))
      .toThrow(/found 1, expected at least 100/);
  });

  it('says what would otherwise be asserted for the wrong reason', () => {
    expect(() => population('x', [])).toThrow(/would pass for the wrong reason/);
  });
});
