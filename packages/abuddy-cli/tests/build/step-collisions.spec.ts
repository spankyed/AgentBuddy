import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPackConfigFromManifest, type PackManifest } from '@abuddy/sdk/build';

let tmp: string | undefined;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function stepsModule(dir: string, file: string, type: string): string {
  const full = path.join(dir, file);
  fs.writeFileSync(full, `export const steps = [{ type: '${type}', build: { compile() { return { entity: {}, relations: [] }; }, validate() { return []; }, getLabel() { return '${type}'; } } }];\n`);
  return full;
}

describe('buildPackConfigFromManifest step registration', () => {
  it("fails when a pack's step type collides with a dependency's instead of silently overriding it", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'step-collisions-'));
    const dependency = stepsModule(tmp, 'dependency.steps.build.mjs', 'collide_step');
    stepsModule(tmp, 'build.mjs', 'collide_step');
    const manifest = { id: 'demo', name: 'Demo', version: '1.0.0', boot: { seed: { flows: 'src/seeds/flows' } }, steps: { build: 'build.mjs', definitions: [] } } as unknown as PackManifest;

    const config = await buildPackConfigFromManifest(manifest, tmp, { dependencyStepModules: [dependency] });
    await expect(config.setup!()).rejects.toThrow(/Step type "collide_step" is defined by this pack and by a dependency/);
  });
});
