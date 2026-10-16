import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import * as installation from '../../src/build/compiler-installation.ts';
import * as checkout from '../../src/build/checkout-packages.ts';
import { _declarationRevision, PACK_SNAPSHOT_FORMAT } from '@apackdev/sdk/build';
import { PACK_LAYOUT, readPackBuild, sealPackBuild } from '@apackdev/host/packs';
import { packInputsHash } from '@apackdev/host/build/pack-inputs';
import { createPackBuilder, type PackBuilder } from '../../src/build/build-process.ts';

const roots: string[] = [];
const builders: PackBuilder[] = [];
afterEach(async () => {
  await Promise.all(builders.splice(0).map(builder => builder.close()));
  vi.restoreAllMocks();
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-builder-'));
  roots.push(root);
  const compiler = path.join(root, 'compiler'), pack = path.join(root, 'pack');
  fs.mkdirSync(path.join(compiler, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(pack, '.apack'), { recursive: true });
  const manifest = { id: 'builder', name: 'Builder', version: '1.0.0' };
  fs.writeFileSync(path.join(pack, 'apack.json'), JSON.stringify(manifest));
  const candidate = path.join(compiler, 'candidate');
  fs.mkdirSync(path.join(candidate, PACK_LAYOUT.runtimeDir), { recursive: true });
  fs.writeFileSync(path.join(candidate, PACK_LAYOUT.runtimeEntry), 'module.exports = {};');
  fs.mkdirSync(path.dirname(path.join(candidate, PACK_LAYOUT.snapshot)), { recursive: true });
  fs.writeFileSync(path.join(candidate, PACK_LAYOUT.snapshot), JSON.stringify({ manifest,
    format: PACK_SNAPSHOT_FORMAT, declarationRevision: _declarationRevision(manifest),
    types: { entities: {}, relKinds: {} }, facades: {} }));
  sealPackBuild(candidate, manifest);
  const handoff = { type: 'apack:build-candidate', inputHash: packInputsHash(pack), revision: readPackBuild(candidate).revision };
  fs.writeFileSync(path.join(compiler, 'package.json'), '{"name":"fixture-compiler","type":"module"}');
  fs.writeFileSync(path.join(compiler, 'label.txt'), 'first');
  fs.writeFileSync(path.join(compiler, 'bin/apack.mjs'), `
    import fs from 'node:fs';
    import {fileURLToPath} from 'node:url';
    fs.writeFileSync('.apack/built.json', JSON.stringify({pid:process.pid, bin:import.meta.url, label:fs.readFileSync(new URL('../label.txt',import.meta.url),'utf8')}));
    if (process.argv.includes('--wait')) {
      process.on('message', () => {});
      process.on('SIGTERM', () => {
        fs.writeFileSync('.apack/stopped.json', JSON.stringify({compilerExists:fs.existsSync(fileURLToPath(import.meta.url))}));
        process.exit(0);
      });
    } else {
      fs.cpSync(new URL('../candidate', import.meta.url), '.apack/build', { recursive: true });
      // Compiler inputs are read-only; staged output must be removable by the parent.
      const writable = directory => {
        fs.chmodSync(directory, 0o755);
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (entry.isDirectory()) writable(directory + '/' + entry.name);
        }
      };
      writable('.apack/build');
      process.send(${JSON.stringify(handoff)}, () => process.disconnect());
    }
  `);
  vi.spyOn(installation, 'compilerPackageDirectory').mockReturnValue(compiler);
  vi.spyOn(checkout, 'ensureCheckoutPackages').mockImplementation(() => {});
  const builder = createPackBuilder(pack);
  builders.push(builder);
  const report = () => JSON.parse(fs.readFileSync(path.join(pack, '.apack/built.json'), 'utf8')) as { pid: number; bin: string; label: string };
  return { compiler, pack, builder, report };
}

it('reuses a verified compiler, refreshes changed or damaged copies, and releases its scope', async () => {
  const { compiler, builder, report } = fixture();
  await builder.build();
  const first = report();
  await builder.build();
  expect(report().bin).toBe(first.bin);
  expect(report().pid).not.toBe(first.pid);
  fs.writeFileSync(path.join(compiler, 'label.txt'), 'updated compiler');
  await builder.build();
  const updated = report();
  expect(updated.label).toBe('updated compiler');
  expect(updated.bin).not.toBe(first.bin);
  expect(fs.existsSync(fileURLToPath(first.bin))).toBe(false);
  const label = fileURLToPath(new URL('../label.txt', updated.bin));
  fs.chmodSync(label, 0o644);
  fs.writeFileSync(label, 'damaged copy');
  await builder.build();
  const repaired = report();
  expect(repaired.label).toBe('updated compiler');
  expect(repaired.bin).not.toBe(updated.bin);
  await builder.close();
  expect(fs.existsSync(fileURLToPath(repaired.bin))).toBe(false);
  await expect(builder.build()).rejects.toThrow('Pack builder is closed');
});

it('stops its worker before removing the compiler on close', async () => {
  const { pack, builder, report } = fixture();
  const running = builder.build({ args: ['--wait'] });
  await vi.waitFor(() => expect(fs.existsSync(path.join(pack, '.apack/built.json'))).toBe(true));
  const active = report();
  const stopped = expect(running).rejects.toMatchObject({ name: 'AbortError' });
  await builder.close();
  await stopped;
  expect(JSON.parse(fs.readFileSync(path.join(pack, '.apack/stopped.json'), 'utf8')).compilerExists).toBe(true);
  expect(() => process.kill(active.pid, 0)).toThrow();
  expect(fs.existsSync(fileURLToPath(active.bin))).toBe(false);
});

it('captures both checkouts after refresh and refuses reuse if refresh fails', async () => {
  const { compiler, pack, builder, report } = fixture();
  vi.spyOn(checkout, 'checkoutFor').mockImplementation(directory => directory === pack ? 'pack-checkout' : 'compiler-checkout');
  vi.mocked(checkout.ensureCheckoutPackages).mockImplementation(directory => {
    const label = path.join(compiler, 'label.txt');
    if (directory === pack) fs.writeFileSync(label, 'pack refreshed');
    else fs.appendFileSync(label, ' and compiler refreshed');
  });
  await builder.build();
  const refreshed = report();
  expect(refreshed.label).toBe('pack refreshed and compiler refreshed');
  vi.mocked(checkout.ensureCheckoutPackages).mockImplementation(() => { throw new Error('Checkout refresh failed'); });
  await expect(builder.build()).rejects.toThrow('Checkout refresh failed');
  expect(report()).toEqual(refreshed);
});
