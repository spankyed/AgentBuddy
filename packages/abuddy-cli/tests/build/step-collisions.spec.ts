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
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `export const steps = [{ type: '${type}', build: { compile() { return { entity: {}, relations: [] }; }, validate() { return []; }, getLabel() { return '${type}'; } } }];\n`);
  return full;
}

describe('buildPackConfigFromManifest step definitions', () => {
  it("fails when a pack's step type collides with a dependency's instead of silently overriding it", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'step-collisions-'));
    const dependency = stepsModule(tmp, 'dependency.steps.build.mjs', 'collide_step');
    // The pack's own build facets come from the module codegen writes, so that is what the fixture plants
    stepsModule(tmp, path.join('src', '__generated__', 'steps-build.ts'), 'collide_step');
    const manifest = { id: 'demo', name: 'Demo', version: '1.0.0', boot: { content: { flows: 'src/content/flows' } } } as unknown as PackManifest;

    const config = await buildPackConfigFromManifest(manifest, tmp, { dependencyStepModules: [dependency] });
    await expect(config.loadDefinitions!()).rejects.toThrow(/Step type "collide_step" is defined by this pack and by a dependency/);
  });
});
