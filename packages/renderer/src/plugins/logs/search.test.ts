import { describe, it, expect } from 'vitest';
import { parseSearchTerm, searchLog, highlightSearchTerm } from './search';
import type { LogEntry } from './state';

describe('parseSearchTerm', () => {
  it('should parse include terms', () => {
    const result = parseSearchTerm('error warning');
    expect(result.includes).toEqual(['error', 'warning']);
    expect(result.excludes).toEqual([]);
  });

  it('should parse exclude terms', () => {
    const result = parseSearchTerm('-debug -verbose');
    expect(result.includes).toEqual([]);
    expect(result.excludes).toEqual(['debug', 'verbose']);
  });

  it('should parse mixed terms', () => {
    const result = parseSearchTerm('error -debug warning -verbose');
    expect(result.includes).toEqual(['error', 'warning']);
    expect(result.excludes).toEqual(['debug', 'verbose']);
  });

  it('should handle empty search', () => {
    const result = parseSearchTerm('');
    expect(result.includes).toEqual([]);
    expect(result.excludes).toEqual([]);
  });

  it('should ignore standalone dash', () => {
    const result = parseSearchTerm('- error -debug');
    expect(result.includes).toEqual(['error']);
    expect(result.excludes).toEqual(['debug']);
  });
});

describe('searchLog', () => {
  const mockLog: LogEntry = {
    id: '1',
    timestamp: Date.now(),
    level: 'info',
    message: 'User authentication successful',
    source: 'auth-service',
    meta: { userId: '123', action: 'login' }
  };

  it('should include log when no filters', () => {
    const filter = { includes: [], excludes: [] };
    expect(searchLog(mockLog, filter)).toBe(true);
  });

  it('should include log when include term matches', () => {
    const filter = { includes: ['auth'], excludes: [] };
    expect(searchLog(mockLog, filter)).toBe(true);
  });

  it('should exclude log when exclude term matches', () => {
    const filter = { includes: [], excludes: ['auth'] };
    expect(searchLog(mockLog, filter)).toBe(false);
  });

  it('should exclude log when both include and exclude match', () => {
    const filter = { includes: ['successful'], excludes: ['auth'] };
    expect(searchLog(mockLog, filter)).toBe(false);
  });

  it('should search in meta data', () => {
    const filter = { includes: ['123'], excludes: [] };
    expect(searchLog(mockLog, filter)).toBe(true);
  });

  it('should handle multiple include terms (OR logic)', () => {
    const filter = { includes: ['failed', 'successful'], excludes: [] };
    expect(searchLog(mockLog, filter)).toBe(true);
  });
});

describe('highlightSearchTerm', () => {
  it('should highlight include terms', () => {
    const result = highlightSearchTerm('error in authentication', 'auth');
    expect(result).toContain('<mark class="text-yellow-200 bg-yellow-500/30">auth</mark>');
  });

  it('should not highlight exclude terms', () => {
    const result = highlightSearchTerm('error in authentication', '-auth error');
    expect(result).toContain('<mark class="text-yellow-200 bg-yellow-500/30">error</mark>');
    expect(result).not.toContain('<mark class="text-yellow-200 bg-yellow-500/30">auth</mark>');
  });

  it('should handle multiple terms', () => {
    const result = highlightSearchTerm('error warning info', 'error info');
    expect(result).toContain('<mark class="text-yellow-200 bg-yellow-500/30">error</mark>');
    expect(result).toContain('<mark class="text-yellow-200 bg-yellow-500/30">info</mark>');
    expect(result).not.toContain('<mark class="text-yellow-200 bg-yellow-500/30">warning</mark>');
  });
});