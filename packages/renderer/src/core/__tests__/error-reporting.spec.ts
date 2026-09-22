// The app reports every uncaught renderer error as fatal, and Monaco's diff view throws one it recovers from.
// Suppressing that one depends on registration order (listeners on a target fire in the order they were added),
// which is why `installGlobalErrorHandling` registers the filter and the reporter together: the behaviour is
// checked here by dispatching both kinds of error, rather than by reading main.ts's source for the call order.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installGlobalErrorHandling } from '../error-reporting';

const write = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  write.mockClear();
  (window as unknown as { electronAPI: unknown }).electronAPI = { rendererLog: { write }, startupId: 'test' };
});

/** Dispatches an uncaught error the way the browser does, and answers what was reported for it */
function uncaught(message: string): Array<Record<string, unknown>> {
  window.dispatchEvent(new ErrorEvent('error', { error: new Error(message), message, cancelable: true }));
  return write.mock.calls.map(([entry]) => entry);
}

describe('the renderer\'s global error handling', () => {
  it('reports an uncaught error as fatal', () => {
    installGlobalErrorHandling();

    expect(uncaught('boom')).toEqual([expect.objectContaining({ source: 'window.error', message: 'boom', fatal: true })]);
  });

  it("doesn't report the diff-range error Monaco recovers from", () => {
    installGlobalErrorHandling();

    expect(uncaught('startLineNumber 5 cannot be after endLineNumberExclusive 3')).toEqual([]);
  });

  it('takes the filter from @abuddy/ui rather than repeating what it suppresses', () => {
    const source = fs.readFileSync(path.join(import.meta.dirname, '..', 'error-reporting.ts'), 'utf-8');

    expect(source).toContain("from '@abuddy/ui/components/monaco-error-filters'");
    expect(source).not.toContain('endLineNumberExclusive');
  });
});
