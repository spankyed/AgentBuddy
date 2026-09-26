// The logs plugin hides entries whose source matches an excluded pattern: exact, with `*` matching anything
import { describe, expect, it } from 'vitest';
import { filterLogsByExcludedSources, isSourceExcluded } from '@/features/logs/be/utils';
import type { LogEntry } from '@/features/logs/be/types';

describe('isSourceExcluded', () => {
  it('hides every action with action:*, and nothing else', () => {
    expect(isSourceExcluded('action:Say Hi', ['action:*'])).toBe(true);
    expect(isSourceExcluded('action:', ['action:*'])).toBe(true);
    expect(isSourceExcluded('log-service', ['action:*'])).toBe(false);
    expect(isSourceExcluded('transaction:x', ['action:*'])).toBe(false);
  });

  it('matches other patterns exactly, with the rest of the pattern literal', () => {
    expect(isSourceExcluded('log-service', ['log-service'])).toBe(true);
    expect(isSourceExcluded('log-services', ['log-service'])).toBe(false);
    expect(isSourceExcluded('action:Say (hi)', ['action:Say (hi)'])).toBe(true);
    expect(isSourceExcluded('debugger', ['debug.*'])).toBe(false);
    expect(isSourceExcluded('debug.flow', ['debug.*'])).toBe(true);
    // A label that isn't a valid regex doesn't throw
    expect(isSourceExcluded('action:[x', ['action:[x'])).toBe(true);
  });

  it('keeps entries without a source', () => {
    expect(isSourceExcluded(undefined, ['*'])).toBe(false);
  });
});

describe('filterLogsByExcludedSources', () => {
  it('drops the entries an excluded pattern matches', () => {
    const entry = (source: string): LogEntry => ({ id: source, level: 'info', message: source, source, timestamp: 0 });
    const logs = [entry('action:A'), entry('brain'), entry('action:B')];
    expect(filterLogsByExcludedSources(logs, ['action:*']).map((log) => log.source)).toEqual(['brain']);
  });
});
