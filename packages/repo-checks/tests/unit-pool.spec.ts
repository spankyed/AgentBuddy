// Reading a vitest run's own output to find out what it actually covered.
//
// The pool asks for N projects with `--project` and then stamps all N. That is only sound if the filter
// selected them: measured, `--project @abuddy/ears --project @abuddy/no-such-project` runs ears, drops the
// second silently and exits 0. Only a filter matching *nothing at all* is an error. So a suite whose
// workspace stopped matching its vitest project name would be stamped as having passed a run it was
// excluded from — the same "recorded fresh having never run" the pool was already fixed for once.
import { describe, expect, it } from 'vitest';
import { projectsThatRan, projectsThatDidNotRun } from '../../../scripts/lib/unit-pool.ts';

const line = (project: string, file: string) => ` ✓ |${project}| ${file} (3 tests) 12ms`;

describe('projectsThatRan', () => {
  it('reads the project label vitest puts on every file of a multi-project run', () => {
    const output = [line('@abuddy/ears', 'tests/a.spec.ts'), line('@app/main', 'tests/b.spec.ts'), line('@abuddy/ears', 'tests/c.spec.ts')].join('\n');
    expect([...projectsThatRan(output)].sort()).toEqual(['@abuddy/ears', '@app/main']);
  });

  it('sees through the colours vitest writes', () => {
    expect([...projectsThatRan(' \u001B[32m✓\u001B[39m |@abuddy/sdk| tests/a.spec.ts (1 test) 2ms')]).toEqual(['@abuddy/sdk']);
  });

  it('counts a failed or skipped file, which still proves the project ran', () => {
    expect([...projectsThatRan([' × |@app/api| tests/a.spec.ts', ' ↓ |@app/api| tests/b.spec.ts'].join('\n'))]).toEqual(['@app/api']);
  });

  it('finds nothing in a run that printed no labels', () => {
    expect([...projectsThatRan(' ✓ tests/a.spec.ts (3 tests) 12ms\n Test Files  1 passed (1)')]).toEqual([]);
  });
});

describe('projectsThatDidNotRun', () => {
  const asked = ['@abuddy/ears', '@app/main'];

  it('names a project that was asked for and never reported', () => {
    expect(projectsThatDidNotRun(asked, line('@abuddy/ears', 'tests/a.spec.ts'))).toEqual(['@app/main']);
  });

  it('says nothing when every project reported', () => {
    expect(projectsThatDidNotRun(asked, [line('@abuddy/ears', 'a'), line('@app/main', 'b')].join('\n'))).toEqual([]);
  });

  // A single-project run prints no labels at all, so absence proves nothing there — the process exiting 0
  // is the evidence, and the pack pool runs exactly one project per invocation
  it('says nothing about a single-project run, which prints no labels', () => {
    expect(projectsThatDidNotRun(['@app/default-setup'], ' ✓ tests/a.spec.ts (3 tests) 12ms')).toEqual([]);
  });

  it('names them all when the filter matched none of several', () => {
    expect(projectsThatDidNotRun(asked, ' Test Files  0 passed (0)')).toEqual(asked);
  });
});
