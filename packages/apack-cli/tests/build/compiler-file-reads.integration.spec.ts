import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { compilePack, buildPackConfigFromManifest, ManifestSchema } from '@apackdev/sdk/build';
import { captureCompilationInputs } from '../../src/build/compilation-inputs.ts';
import { withCompilerFileReads } from '../../src/build/compiler-file-reads.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it('executes content reads through files, streams and descriptors while writable handles stay native', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-content-reads-')));
  roots.push(root);
  const source = path.join(root, 'src/payload.txt');
  fs.mkdirSync(path.dirname(source));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module', main: source }));
  fs.writeFileSync(source, 'CAPTURED');
  fs.writeFileSync(path.join(root, 'src/compiler.mjs'), `import fs from 'node:fs';
    import {readFile, open} from 'node:fs/promises';
    export default async ({path}) => {
      const sync = fs.readFileSync(new URL('file://' + path), 'utf8');
      const callback = await new Promise((resolve, reject) => fs.readFile(Buffer.from(path), 'utf8', (err, value) => err ? reject(err) : resolve(value)));
      const promise = await readFile(path, 'utf8');
      const chunks = [];
      const stream = fs.createReadStream(path, {encoding: 'utf8'});
      for await (const chunk of stream) chunks.push(chunk);
      if (stream.path !== path) throw new Error('Stream exposed a private path');
      const fd = fs.openSync(path, fs.constants.O_RDONLY);
      let descriptor;
      try { descriptor = fs.readFileSync(fd, 'utf8'); } finally { fs.closeSync(fd); }
      const callbackDescriptor = await new Promise((resolve, reject) => fs.open(path, 'r', (err, fd) => {
        if (err) { reject(err); return; }
        try { resolve(fs.readFileSync(fd, 'utf8')); } catch (err) { reject(err); } finally { fs.closeSync(fd); }
      }));
      const handle = await open(path, 'r');
      let handled;
      try { handled = await handle.readFile('utf8'); } finally { await handle.close(); }
      return [{entity: 'Row', name: [sync, callback, promise, chunks.join(''), descriptor, callbackDescriptor, handled].join(':')}];
    };`);
  const manifest = ManifestSchema.parse({ id: 'content-reads', name: 'Content reads', version: '1.0.0',
    content: { formats: { rows: { compiler: 'src/compiler.mjs', entity: 'Row', identity: ['name'] } },
      sources: { rows: { path: 'src/payload.txt', format: 'rows' } } } });
  const compilation = captureCompilationInputs(root);
  const outputDirectory = path.join(root, 'dist');
  try {
    fs.writeFileSync(source, 'LIVE');
    await withCompilerFileReads({ compilation, outputDirectory }, async () => {
      await compilePack({ packDir: root, outputDir: outputDirectory,
        packConfig: await buildPackConfigFromManifest(manifest, root),
        importModule: file => import(pathToFileURL(file).href) });
      const writable = fs.openSync(source, fs.constants.O_RDWR);
      try { expect(fs.readFileSync(writable, 'utf8')).toBe('LIVE'); }
      finally { fs.closeSync(writable); }
      expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main).toBe(source);
      const output = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'rows.content.json'), 'utf8'));
      expect(output.records[0].name).toBe(Array(7).fill('CAPTURED').join(':'));
      fs.writeFileSync(path.join(outputDirectory, 'live.txt'), 'FIRST');
      expect(fs.readFileSync(path.join(outputDirectory, 'live.txt'), 'utf8')).toBe('FIRST');
      const handle = await fs.promises.open(path.join(outputDirectory, 'live.txt'), 'w');
      try { await handle.writeFile('SECOND'); } finally { await handle.close(); }
      expect(fs.readFileSync(path.join(outputDirectory, 'live.txt'), 'utf8')).toBe('SECOND');
    });
    expect(fs.readFileSync(source, 'utf8')).toBe('LIVE');
    fs.writeFileSync(source, 'CAPTURED');
    compilation.assertCurrent();
  } finally { compilation.dispose(); }
});

it('keeps concurrent build views isolated and reports missing input paths without private locations', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-concurrent-reads-')));
  roots.push(root);
  const source = path.join(root, 'value.txt');
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(source, 'FIRST');
  const first = captureCompilationInputs(root);
  fs.writeFileSync(source, 'SECOND');
  const second = captureCompilationInputs(root);
  fs.writeFileSync(source, 'LIVE');
  const outputDirectory = path.join(root, 'dist');
  try {
    const values = await Promise.all([first, second].map(compilation =>
      withCompilerFileReads({ compilation, outputDirectory }, async () => {
        await new Promise(resolve => setImmediate(resolve));
        const data = await fs.promises.readFile(source, 'utf8');
        const missing = path.join(root, 'missing.txt');
        try { await fs.promises.readFile(missing); throw new Error('Missing file was read'); }
        catch (error) {
          expect(error).toMatchObject({ code: 'ENOENT', path: missing });
          expect(String(error)).not.toContain('apack-inputs-');
        }
        return data;
      })));
    expect(values).toEqual(['FIRST', 'SECOND']);
    expect(fs.readFileSync(source, 'utf8')).toBe('LIVE');
  } finally { first.dispose(); second.dispose(); }
});

it('owns native directory results across sync, callback and promise reads without exposing mutable Dirents', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-directory-reads-')));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  const directory = path.join(root, 'content');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'original.txt'), 'ORIGINAL');
  fs.symlinkSync('original.txt', path.join(directory, 'linked.txt'));
  const incumbent = path.join(root, 'dist/previous.txt');
  fs.mkdirSync(path.dirname(incumbent));
  fs.writeFileSync(incumbent, 'PREVIOUS');
  const baseline = fs.readdirSync(directory, { withFileTypes: true });
  const compilation = captureCompilationInputs(root);
  const options = { withFileTypes: true } as const;
  try {
    await withCompilerFileReads({ compilation, outputDirectory: path.join(root, '.apack/staging') }, async () => {
      expect(fs.readFileSync(incumbent, 'utf8')).toBe('PREVIOUS');
      const first = fs.readdirSync(directory, options);
      const names = baseline.map(entry => entry.name);
      expect(first.map(entry => entry.name)).toEqual(names);
      first[0]!.name = 'MUTATED';
      first.pop();
      const late = path.join(directory, 'late.txt');
      fs.writeFileSync(late, 'LATE');
      const promise = await fs.promises.readdir(directory, options);
      const callback = await new Promise<fs.Dirent[]>((resolve, reject) =>
        fs.readdir(directory, options, (error, entries) => error ? reject(error) : resolve(entries)));
      for (const entries of [promise, callback]) {
        expect(entries.map(entry => entry.name)).toEqual(names);
        expect(entries.find(entry => entry.name === 'linked.txt')?.isSymbolicLink()).toBe(true);
        expect(entries.every(entry => entry.parentPath === directory)).toBe(true);
      }
      expect(() => compilation.assertCurrent()).toThrow('Compiler or installed package inputs changed');
      fs.unlinkSync(late);
      const buffers = fs.readdirSync(directory, { encoding: 'buffer' });
      expect(buffers.map(entry => entry.toString())).toEqual(names);
      buffers[0]!.fill(0);
      expect(fs.readdirSync(directory, { encoding: 'buffer' }).map(entry => entry.toString())).toEqual(names);
    });
    compilation.assertCurrent();
  } finally { compilation.dispose(); }
});
