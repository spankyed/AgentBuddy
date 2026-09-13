import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeEntries, findComponentsWithoutEntry } from '../../../abuddy-ui/scripts/exports.ts';

/** packages/abuddy-ui/scripts/exports.ts: which modules @abuddy/ui publishes */
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-ui-exports-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, content = ''): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

describe('computeEntries', () => {
  it('publishes .ts modules but not specs, tests, declarations or internal modules', () => {
    for (const file of [
      'src/design/button.ts', 'src/design/button.vue', 'src/composables/useDebounce.ts',
      'src/composables/useDebounce.spec.ts', 'src/composables/useDebounce.test.ts', 'src/env.d.ts',
      'src/components/internal/layout.ts', 'src/components/tiptap/internal/helpers.ts',
    ]) write(file);
    expect(computeEntries(path.join(root, 'src'))).toEqual({
      'composables/useDebounce': 'src/composables/useDebounce.ts',
      'design/button': 'src/design/button.ts',
    });
  });
});

describe('findComponentsWithoutEntry', () => {
  it('reports components imported from outside @abuddy/ui without a published entry', () => {
    write('src/design/button.vue');
    write('src/design/button.ts');
    write('src/design/dialog.vue');
    write('src/internal/Panel.vue');
    write('src/internal/Panel.ts');
    write('consumer/app.ts', [
      "import Button from '@abuddy/ui/design/button';",
      "import Dialog from '@abuddy/ui/design/dialog';",
      "import Panel from '@abuddy/ui/internal/Panel';",
    ].join('\n'));
    expect(findComponentsWithoutEntry([path.join(root, 'consumer')], path.join(root, 'src')).map((line) => line.split(': ')[1]))
      .toEqual(['@abuddy/ui/design/dialog', '@abuddy/ui/internal/Panel']);
  });
});
