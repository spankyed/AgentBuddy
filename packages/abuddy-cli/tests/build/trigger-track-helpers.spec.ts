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
  /**
   * `trackField` is a member of the TriggerFacet rather than a manifest field, so the builder's name comes
   * out of the module the entry names — not out of whatever file in the step's folder happens to mention
   * one. The folder here holds a second module that does, which is what says which of the two was read.
   */
  it("read trackField from the module the entry names, not from another file beside it", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'track-helpers-'));
    const stepDir = path.join(tmp, 'src', 'extensions', 'steps', 'tick');
    fs.mkdirSync(stepDir, { recursive: true });
    fs.writeFileSync(path.join(stepDir, 'build.ts'), "export const tickTrigger = { trackField: 'every' };\n");
    fs.writeFileSync(path.join(stepDir, 'legacy.ts'), "export const old = { trackField: 'whenever' };\n");
    const manifest = {
      id: 'ticks', name: 'Ticks', version: '1.0.0',
      extensions: { steps: { tick: { kind: 'trigger', trigger: { facet: 'src/extensions/steps/tick/build.ts#tickTrigger' } } } },
    } as unknown as PackManifest;

    const files = generatePackFiles(manifest, { packRoot: tmp });
    const helpers = Object.entries(files).find(([file]) => file.endsWith('flow-helpers.ts'))?.[1] ?? '';

    expect(helpers).toMatch(/export function every\(every: string/);
    expect(helpers).not.toMatch(/whenever/);
  });
});
