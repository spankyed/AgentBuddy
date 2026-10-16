import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
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

it('shares captured metadata across native sync, callback and promise APIs', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-metadata-scope-')));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  const file = path.join(root, 'value.txt');
  const link = path.join(root, 'linked.txt');
  const missing = path.join(root, 'missing.txt');
  fs.writeFileSync(file, 'ONE');
  fs.symlinkSync('value.txt', link);
  const compilation = captureCompilationInputs(root);
  try {
    await withCompilerFileReads({ compilation, outputDirectory: path.join(root, 'dist') }, async () => {
      expect(fs.statSync(file).size).toBe(3);
      expect(fs.statSync(file, { bigint: true }).size).toBe(3n);
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync.native(link)).toBe(file);
      expect(await fs.promises.readlink(link)).toBe('value.txt');
      expect(fs.existsSync(missing)).toBe(false);
      await fs.promises.access(file, fs.constants.R_OK);
      fs.writeFileSync(file, 'DIFFERENT');
      fs.writeFileSync(missing, 'NEW');
      expect((await fs.promises.stat(file)).size).toBe(3);
      const stat = await new Promise<fs.Stats>((resolve, reject) => fs.stat(file, (error, value) => error ? reject(error) : resolve(value)));
      expect(stat.size).toBe(3);
      expect(await new Promise(resolve => fs.exists(missing, resolve))).toBe(false);
      expect(await promisify(fs.exists)(missing)).toBe(false);
      expect(() => compilation.assertCurrent()).toThrow('Compiler or installed package inputs changed');
      fs.writeFileSync(file, 'ONE');
      fs.unlinkSync(missing);
    });
    compilation.assertCurrent();
  } finally { compilation.dispose(); }
});

it('keeps descriptor metadata with captured bytes through pathname replacement and closure', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-descriptor-scope-')));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  const file = path.join(root, 'value.txt'), held = path.join(root, 'held.txt');
  fs.writeFileSync(file, 'ORIGINAL');
  const source = fs.statSync(file, { bigint: true });
  const compilation = captureCompilationInputs(root);
  try {
    fs.writeFileSync(file, 'LIVE');
    await withCompilerFileReads({ compilation, outputDirectory: path.join(root, 'dist') }, async () => {
      const defaultFd = await new Promise<number>((resolve, reject) => fs.open(file, (error, fd) => error ? reject(error) : resolve(fd)));
      try { expect(fs.readFileSync(defaultFd, 'utf8')).toBe('ORIGINAL'); }
      finally { await new Promise<void>((resolve, reject) => fs.close(defaultFd, error => error ? reject(error) : resolve())); }
      const fd = fs.openSync(file, 'r');
      const handle = await fs.promises.open(file, 'r');
      fs.renameSync(file, held);
      fs.writeFileSync(file, 'REPLACEMENT');
      try {
        expect(fs.readFileSync(fd, 'utf8')).toBe('ORIGINAL');
        const stat = fs.fstatSync(fd);
        expect(stat.ino).toBe(Number(source.ino));
        expect(stat.mode).toBe(Number(source.mode));
        expect(stat.size).toBe(8);
        const callback = await new Promise<fs.BigIntStats>((resolve, reject) =>
          fs.fstat(fd, { bigint: true }, (error, value) => error ? reject(error) : resolve(value)));
        expect(callback.ino).toBe(source.ino);
        expect(callback.size).toBe(8n);
        expect((await handle.stat({ bigint: true })).ino).toBe(source.ino);
        expect((await handle.stat()).size).toBe(8);
      } finally {
        fs.closeSync(fd);
        await handle.close();
        fs.unlinkSync(file);
        fs.renameSync(held, file);
      }
      expect(() => fs.fstatSync(fd)).toThrow(/EBADF/);
      await expect(handle.stat()).rejects.toMatchObject({ code: 'EBADF' });
      const output = path.join(root, 'dist/output.txt');
      fs.mkdirSync(path.dirname(output), { recursive: true });
      const writable = fs.openSync(output, 'w+');
      try {
        fs.writeSync(writable, 'OUTPUT');
        expect(fs.fstatSync(writable).ino).toBe(fs.statSync(output).ino);
        expect(fs.fstatSync(writable).size).toBe(6);
      } finally { fs.closeSync(writable); }
    });
    fs.writeFileSync(file, 'ORIGINAL');
    compilation.assertCurrent();
  } finally { compilation.dispose(); }
});

it('serves captured opendir membership through all native handle entry points', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-opendir-scope-')));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  const source = path.join(root, 'content');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'original.txt'), 'ORIGINAL');
  fs.mkdirSync(path.join(source, 'nested'));
  fs.writeFileSync(path.join(source, 'nested/child.txt'), 'CHILD');
  const options = { recursive: true, bufferSize: 1 };
  const baseline = fs.opendirSync(source, options);
  const expected: string[] = [];
  try { for (let entry; (entry = baseline.readSync()) !== null;) expected.push(path.join(entry.parentPath, entry.name)); }
  finally { baseline.closeSync(); }
  const compilation = captureCompilationInputs(root);
  try {
    await withCompilerFileReads({ compilation, outputDirectory: path.join(root, 'dist') }, async () => {
      const standard = await fs.promises.opendir(source, {});
      const names: string[] = [];
      for await (const entry of standard) names.push(entry.name);
      expect(names.sort()).toEqual(['nested', 'original.txt']);
      const first = fs.opendirSync(source, options);
      const late = path.join(source, 'late.txt');
      const values: string[] = [];
      try { for (let entry; (entry = first.readSync()) !== null;) values.push(path.join(entry.parentPath, entry.name)); }
      finally { first.closeSync(); }
      expect(values).toEqual(expected);
      fs.writeFileSync(late, 'LATE');
      const promised = await fs.promises.opendir(source, options);
      const actual: string[] = [];
      for await (const entry of promised) actual.push(path.join(entry.parentPath, entry.name));
      expect(actual).toEqual(expected);
      const callback = await new Promise<fs.Dir>((resolve, reject) => fs.opendir(source, options, (error, directory) => error ? reject(error) : resolve(directory)));
      try {
        const one = await callback.read();
        expect(path.join(one!.parentPath, one!.name)).toBe(expected[0]);
      } finally { await callback.close(); }
      expect(() => compilation.assertCurrent()).toThrow('Compiler or installed package inputs changed');
      fs.unlinkSync(late);
    });
    compilation.assertCurrent();
  } finally { compilation.dispose(); }
});
