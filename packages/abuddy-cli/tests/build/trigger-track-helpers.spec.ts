import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generatePackFiles, type PackManifest } from '@abuddy/sdk/build';

let tmp: string | undefined;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('generated trigger track builders', () => {
  it('finds trackField in index.ts when the step folder also has a helper build.ts', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'track-helpers-'));
    const stepDir = path.join(tmp, 'src', 'extensions', 'steps', 'tick');
    fs.mkdirSync(stepDir, { recursive: true });
    fs.writeFileSync(path.join(stepDir, 'build.ts'), 'export function parseInterval(value: string) { return value; }\n');
    fs.writeFileSync(path.join(stepDir, 'index.ts'), "export const tickTrigger = { type: 'tick', kind: 'trigger', trigger: { trackField: 'every' } };\n");
    const manifest = {
      id: 'ticks', name: 'Ticks', version: '1.0.0',
      steps: { register: 'src/extensions/steps/register.ts', definitions: [{ type: 'tick', path: 'src/extensions/steps/tick', kind: 'trigger' }] },
    } as unknown as PackManifest;

    const files = generatePackFiles(manifest, { packRoot: tmp });
    const helpers = Object.entries(files).find(([file]) => file.endsWith('flow-helpers.ts'))?.[1] ?? '';

    expect(helpers).toMatch(/export function every\(every: string/);
  });
});
