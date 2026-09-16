import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findAppImportsInPackTests, findHostImports, findJsSpecifiers, findPackBackendConsole, findRawPackHelpers, findRawTransport } from '../../../../scripts/check-import-specifiers.ts';
import { REPO_ROOT } from '../helpers/published-packages';

/** scripts/check-import-specifiers.ts: relative imports in sdk, host and ui name TypeScript sources */
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-specifiers-'));
  for (const [file, content] of Object.entries({
    'query.ts': 'export const q = 1;',
    'view.tsx': 'export const v = 1;',
    'module.mts': 'export const m = 1;',
    'common.cts': 'export const c = 1;',
    'declared.d.ts': 'export declare const d: number;',
  })) write(file, content);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, 'src', file)), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', file), content);
}

function problems(file: string, content: string): string[] {
  write(file, content);
  return findJsSpecifiers(['src'], root);
}

describe('findJsSpecifiers', () => {
  it.each([
    ['import', "import { q } from './query.js';"],
    ['side-effect import', "import './query.js';"],
    ['re-export', "export * from './query.js';"],
    ['dynamic import', "export const load = () => import('./query.js');"],
    ['import type', "export type Q = typeof import('./query.js');"],
    ['import-equals', "import q = require('./query.js');"],
    ['require', "const q = require('./query.js');"],
    ['require.resolve', "const q = require.resolve('./query.js');"],
    ['vi.mock', "vi.mock('./query.js', () => ({}));"],
    ['vi.importActual', "await vi.importActual('./query.js');"],
    ['a .tsx target', "import { v } from './view.js';"],
    ['a .mts target', "import { m } from './module.mjs';"],
    ['a .cts target', "import { c } from './common.cjs';"],
  ])('flags: %s', (_form, code) => {
    expect(problems('consumer.ts', code)).toEqual([expect.stringMatching(/^src\/consumer\.ts:1: \.\//)]);
  });

  it.each(['consumer.tsx', 'consumer.mts', 'consumer.cts'])('checks %s files', (file) => {
    expect(problems(file, "import { q } from './query.js';")).toHaveLength(1);
  });

  it('checks .vue script blocks with their line numbers', () => {
    expect(problems('Widget.vue', "<template><div /></template>\n<script setup lang=\"ts\">\nimport { q } from './query.js';\n</script>\n"))
      .toEqual(['src/Widget.vue:3: ./query.js']);
  });

  it('allows .ts specifiers, declaration-only modules and packages', () => {
    expect(problems('consumer.ts', [
      "import { q } from './query.ts';",
      "import type { d } from './declared.js';",
      "import { x } from 'some-package/x.js';",
      "vi.mock('./missing.js');",
    ].join('\n'))).toEqual([]);
  });

  it('runs as a script through a symlinked path', () => {
    const link = path.join(root, 'check.ts');
    fs.symlinkSync(path.join(REPO_ROOT, 'scripts', 'check-import-specifiers.ts'), link);
    const output = execFileSync(path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), [link], { cwd: REPO_ROOT, stdio: 'pipe' }).toString();
    expect(output).toMatch(/Relative import specifiers name \.ts sources/);
    // It checks the whole repo, parsing every file
  }, 60_000);
});

/** Pack code a CLI template writes, in a file under one of CLI_TEMPLATE_SOURCES */
function writeTemplateSource(content: string): string {
  const dir = 'packages/abuddy-cli/src/commands/add';
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, dir, 'feature.ts'), content);
  return dir;
}

/** Code none of the pack rules flag: comments, string text and the allowed imports */
const ALLOWED = [
  "// import { emit } from '@abuddy/sdk/events'; rootEvents; trpc.bus; console.log('x')",
  "/* import * as events from '@abuddy/sdk/events'; console.log('x') */",
  "const url = 'https://console.anthropic.com/settings/keys';",
  "const prompt = `rootEvents.emitOutgoing(event); console.log(ev.type)`;",
  "import { emit, sendToSystem } from '#generated/events';",
  "import { sendToPlugin } from '@/__generated__/events';",
  "import { sendToBrainSystem, onIncoming } from '@abuddy/sdk/events';",
  "import { emit as emitEvent } from 'xstate';",
  "import * as ears from '@abuddy/sdk/ears';",
  "import { x } from '@abuddy/sdk/rpcx';",
  'const { busId } = trpc; trpc.buses.list();',
  "logger.info('saved');",
].join('\n');

describe('findRawPackHelpers', () => {
  it.each([
    ["import { emit as emitToPlugin } from '@abuddy/sdk/events';", 'emit from @abuddy/sdk/events'],
    ["import onConnected, { sendToSystem } from '@abuddy/sdk/events';", 'sendToSystem from @abuddy/sdk/events'],
    ["import { sendToPlugin, services } from '@abuddy/sdk/services';", 'sendToPlugin from @abuddy/sdk/services'],
    ["import { registerRepository, tx } from '@abuddy/sdk/ears';", 'registerRepository from @abuddy/sdk/ears'],
    ["export type { emit } from '@abuddy/sdk/events';", 'emit from @abuddy/sdk/events'],
    ["import * as events from '@abuddy/sdk/events';", '* from @abuddy/sdk/events (import the names)'],
    ["export * from '@abuddy/sdk/events';", '* from @abuddy/sdk/events (import the names)'],
  ])('flags %s', (code, problem) => {
    write('pack/feature.ts', code);
    expect(findRawPackHelpers(['src/pack'], root)).toEqual([`src/pack/feature.ts:1: ${problem}`]);
  });

  it('allows comments, strings and the generated facades, and exempts generated files', () => {
    write('pack/feature.ts', ALLOWED);
    write('pack/__generated__/repositories.ts', "import { registerRepository } from '@abuddy/sdk/ears';\n");
    expect(findRawPackHelpers(['src/pack'], root)).toEqual([]);
  });

  it('checks .vue script blocks with their line numbers', () => {
    write('pack/Widget.vue', "<template><pre>import { emit } from '@abuddy/sdk/events'</pre></template>\n<script setup lang=\"ts\">\n\nimport { emit } from '@abuddy/sdk/events';\n</script>\n");
    expect(findRawPackHelpers(['src/pack'], root)).toEqual(['src/pack/Widget.vue:4: emit from @abuddy/sdk/events']);
  });

  it("checks the pack code in the CLI's templates, with its line", () => {
    const dir = writeTemplateSource("const name = 'x';\nexport const SYSTEM = `// ${name}\nconst label = \\`${name}\\`;\nimport { ${name}, emit } from '@abuddy/sdk/events';\n`;\n");
    expect(findRawPackHelpers([dir], root)).toEqual([`${dir}/feature.ts:4: emit from @abuddy/sdk/events`]);
  });
});

describe('findRawTransport', () => {
  it.each([
    ["import { trpc } from '@abuddy/sdk/rpc';", '@abuddy/sdk/rpc'],
    ["const rpc = await import('@abuddy/sdk/rpc/client');", '@abuddy/sdk/rpc/client'],
    ['rootEvents.emitOutgoing(event);', 'rootEvents'],
    ["trpc.bus.send.mutate({ systemId: 'notes', type: 'GET_NOTES' });", 'trpc.bus'],
    ['trpc?.bus.send.mutate(event);', 'trpc.bus'],
  ])('flags %s', (code, problem) => {
    write('pack/feature.ts', code);
    expect(findRawTransport(['src/pack'], root)).toEqual([`src/pack/feature.ts:1: ${problem}`]);
  });

  it('allows comments, strings and the typed sends, and checks generated files', () => {
    write('pack/feature.ts', ALLOWED);
    write('pack/__generated__/events.ts', "\nimport { rootEvents } from '@abuddy/sdk/runtime';\n");
    expect(findRawTransport(['src/pack'], root)).toEqual(['src/pack/__generated__/events.ts:2: rootEvents']);
  });

  it("checks the pack code in the CLI's templates, with its line", () => {
    const dir = writeTemplateSource('export const STATE = `\ntrpc.bus.send.mutate(event);\n`;\n');
    expect(findRawTransport([dir], root)).toEqual([`${dir}/feature.ts:2: trpc.bus`]);
  });
});

describe('findPackBackendConsole', () => {
  it.each([
    ['features/notes/be/system.ts', "console.log('saved');", 'console.log'],
    ['features/hooks.ts', "console?.warn('init');", 'console.warn'],
    ['migrations/0.4.0.ts', "const x = `${console.info('x')}`;", 'console.info'],
    ['extensions/steps/llm/runtime.ts', "console.debug('prompt');", 'console.debug'],
  ])('flags a console use in %s', (file, code, problem) => {
    write(`pack/${file}`, code);
    expect(findPackBackendConsole(['src/pack'], root)).toEqual([`src/pack/${file}:1: ${problem}`]);
  });

  it('allows comments and string text', () => {
    write('pack/features/notes/be/system.ts', ALLOWED);
    expect(findPackBackendConsole(['src/pack'], root)).toEqual([]);
  });

  it('checks backend paths from the pack src root only', () => {
    for (const file of [
      'features/notes/fe/state.ts',
      'extensions/steps/llm/fe.ts',
      'extensions/register-fe.ts',
      'extensions/tiptap/index.ts',
      'extensions/artifacts/viewers/format.ts',
      'extensions/blocks/display/label.ts',
      'extensions/Welcome.vue',
      'features/notes/be/system.spec.ts',
      'features/notes/be/__tests__/helpers.ts',
      'lib/features/notes/be/system.ts',
      'seeds/actions/run.ts',
    ]) write(`pack/${file}`, "console.log('x');");
    expect(findPackBackendConsole(['src/pack'], root)).toEqual([]);
  });

  it("skips the CLI's template sources and single files", () => {
    const dir = writeTemplateSource("console.log('Created pack');");
    write('pack/features/hooks.ts', "console.log('x');");
    expect(findPackBackendConsole([dir, 'src/pack/features/hooks.ts'], root)).toEqual([]);
  });
});

describe('findHostImports', () => {
  it.each([
    ["import { edgeStore } from '@abuddy/host/ears';", '@abuddy/host/ears'],
    ["import type { PackRegistration } from '@abuddy/host/packs';", '@abuddy/host/packs'],
    ["export { clearMemory } from '@abuddy/host/ears';", '@abuddy/host/ears'],
    ["const backup = await import('@abuddy/host/backup');", '@abuddy/host/backup'],
    ["const { envs } = require('@abuddy/host/ears');", '@abuddy/host/ears'],
    ["import '@abuddy/host';", '@abuddy/host'],
    // A CLI template writes this as pack source
    ["const REPO = `import { edgeStore } from '@abuddy/host/ears';`;", '@abuddy/host/ears'],
  ])('flags %s', (code, specifier) => {
    write('pack/feature.ts', code);
    expect(findHostImports(['src/pack'], root)).toEqual([`src/pack/feature.ts:1: ${specifier}`]);
  });

  it('checks generated files and allows the SDK', () => {
    write('pack/feature.ts', "import { findRelations, untypedQx } from '@abuddy/sdk/ears';\nimport { services } from '#generated/services';\n");
    write('pack/__generated__/ears.ts', "import { qx } from '@abuddy/host/ears';\n");
    expect(findHostImports(['src/pack'], root)).toEqual(['src/pack/__generated__/ears.ts:1: @abuddy/host/ears']);
  });
});

describe('findAppImportsInPackTests', () => {
  it.each([
    ["import { clearMemory } from '@abuddy/host/ears';", '@abuddy/host/ears'],
    ["import '@/setup/sdk-host-init';", '@/setup/sdk-host-init'],
    ["import { rootEvents } from '@/core/router/bus-emitter';", '@/core/router/bus-emitter'],
    ["const { init } = await import('../../../abuddy-cli/src/commands/init');", '../../../abuddy-cli/src/commands/init'],
    ["import { installPackFromLocal } from '../../../abuddy-host/src/packs/pack-installer';", '../../../abuddy-host/src/packs/pack-installer'],
  ])('flags %s', (code, specifier) => {
    write('pack-tests/unit/feature.spec.ts', code);
    expect(findAppImportsInPackTests(['src/pack-tests'], root)).toEqual([`src/pack-tests/unit/feature.spec.ts:1: ${specifier}`]);
  });

  it('allows the SDK, the harness and the pack itself', () => {
    write('pack-tests/unit/feature.spec.ts', [
      "import { untypedQx } from '@abuddy/sdk/ears';",
      "import { startApp } from '@abuddy/testing/harness';",
      "import { repository } from '@/__generated__/repository';",
      "import { handler } from '../../src/extensions/steps/llm/runtime';",
    ].join('\n'));
    expect(findAppImportsInPackTests(['src/pack-tests'], root)).toEqual([]);
  });
});
