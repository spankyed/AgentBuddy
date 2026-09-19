// The app reports every uncaught renderer error as fatal. Monaco's diff view throws one it recovers
// from, and the filter that suppresses it only works if it is registered first: listeners on one
// target fire in the order they were added, and the capture flag does not change that for an event
// dispatched at the target itself. This is a source-order rule, so it is checked as one — mounting the
// app to observe it would reproduce the race rather than the ordering.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const main = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'main.ts'), 'utf-8');

describe('the renderer\'s global error handling', () => {
  it('installs the Monaco error filter before its own error listener', () => {
    const filter = main.indexOf('installMonacoErrorFilters()');
    const listener = main.indexOf("window.addEventListener('error'");
    expect(filter, 'main.ts calls installMonacoErrorFilters()').toBeGreaterThan(-1);
    expect(listener, "main.ts adds a window 'error' listener").toBeGreaterThan(-1);
    expect(filter).toBeLessThan(listener);
  });

  it('takes the filter from @abuddy/ui rather than repeating what it suppresses', () => {
    expect(main).toContain("from '@abuddy/ui/components/monaco-error-filters'");
    expect(main).not.toContain('endLineNumberExclusive');
  });
});
