import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { generate, root, setupPackFixture, write } from './_support/pack.ts';

setupPackFixture();

it('keeps the manifest target and source object when binding a migration instance', async () => {
  write('migration.ts', `
class Migration {
  target = '99.0.0';
  description = 'Instance migration';
  marker = 'source object';
  up() { if (this.marker !== 'source object') throw new Error('Lost migration receiver'); }
}
export const migration = new Migration();
`);
  const files = await generate({ migrations: { app: { '1.0.0': 'migration.ts#migration' } } });
  for (const [file, contents] of Object.entries(files)) write(file, contents);
  fs.symlinkSync(path.resolve(__dirname, '../../../../../node_modules'), path.join(root, 'node_modules'), 'dir');
  const output = path.join(root, 'entry.cjs');
  await build({ entryPoints: [path.join(root, 'src/__generated__/pack-entry.ts')], outfile: output,
    bundle: true, platform: 'node', format: 'cjs' });
  const { registration } = createRequire(import.meta.url)(output) as {
    registration: { migrations: { app: { target: string; description: string; up(): void }[] } };
  };
  const migration = registration.migrations.app[0]!;
  expect(migration.target).toBe('1.0.0');
  expect(migration.description).toBe('Instance migration');
  expect(() => migration.up()).not.toThrow();
});
