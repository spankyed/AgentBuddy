import { describe, expect, it } from 'vitest';
import { parseShard, selectOnly, shardArg, STRICT_JOBS, strictJobSteps } from '../../../scripts/lib/chain-only.ts';
import { CHAIN_STEPS, orderedSteps } from '../../../scripts/lib/chain-steps.ts';
import { TYPECHECK_LEGS } from '../../../scripts/lib/typecheck-legs.ts';

const STEPS = [
  { name: 'produce', dependsOn: [] },
  { name: 'prepare', dependsOn: ['produce'] },
  { name: 'test', dependsOn: ['produce', 'prepare'] },
  { name: 'other', dependsOn: [] },
];

describe('--shard', () => {
  it('reads k/N for 1 <= k <= N and hands vitest the same', () => {
    expect(parseShard('2/3')).toEqual({ index: 2, total: 3 });
    expect(shardArg(parseShard('3/3'))).toBe('--shard=3/3');
  });

  it.each(['0/3', '4/3', '1', '1/0', 'a/b', '1/3/4'])('refuses %s', (value) => {
    expect(() => parseShard(value)).toThrow('--shard takes k/N');
  });
});

describe('--only', () => {
  it('runs the named steps alone, keeping only the edges between them', () => {
    expect(selectOnly(STEPS, ['prepare', 'test'], () => null)).toEqual([
      { name: 'prepare', dependsOn: [] },
      { name: 'test', dependsOn: ['prepare'] },
    ]);
  });

  it('asks about each producer left out, and nothing else', () => {
    const asked: string[] = [];
    selectOnly(STEPS, ['test'], (producer) => { asked.push(producer); return null; });
    expect(asked.sort()).toEqual(['prepare', 'produce']);
  });

  it('refuses a producer whose outputs are not current here, naming who reads it and why', () => {
    expect(() => selectOnly(STEPS, ['test'], (producer) => producer === 'prepare' ? 'no stamp' : null))
      .toThrow(/--only refused[\s\S]*test reads prepare, which is not current here \(no stamp\)/);
  });

  it('refuses a name that is not a step rather than running nothing', () => {
    expect(() => selectOnly(STEPS, ['test', 'tset'], () => null)).toThrow('--only names no chain step: tset');
  });
});

describe('--job', () => {
  const GRAPH = [
    { name: 'build', dependsOn: [] },
    { name: 'fixtures', dependsOn: ['build'] },
    { name: 'leg', dependsOn: [] },
    { name: 'test:integration', dependsOn: ['fixtures'] },
    { name: 'test:native', dependsOn: ['build'] },
    { name: 'app', dependsOn: ['build'] },
  ];

  it('makes the producers everything the pools read, transitively, plus the named legs', () => {
    expect(strictJobSteps(GRAPH, 'producers', ['leg'])).toEqual(['build', 'fixtures', 'leg']);
    expect(strictJobSteps(GRAPH, 'integration', ['leg'])).toEqual(['test:integration']);
    expect(strictJobSteps(GRAPH, 'rest', ['leg'])).toEqual(['app']);
  });

  it('partitions the real table: every step in exactly one job', () => {
    const steps = orderedSteps(CHAIN_STEPS);
    const legs = TYPECHECK_LEGS.map((leg) => leg.name);
    const jobs = STRICT_JOBS.flatMap((job) => strictJobSteps(steps, job, legs));
    expect([...jobs].sort()).toEqual(steps.map((step) => step.name).sort());
    // Each job but the producers runs only on what an earlier job made, which `selectOnly` then requires
    const producers = new Set(strictJobSteps(steps, 'producers', legs));
    for (const step of steps.filter((candidate) => producers.has(candidate.name))) {
      expect(step.dependsOn.filter((need) => !producers.has(need)), step.name).toEqual([]);
    }
  });
});
