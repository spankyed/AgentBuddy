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

it('executes a content compiler with captured sync, callback and promise bytes while output reads stay live', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-content-reads-')));
  roots.push(root);
  const source = path.join(root, 'src/payload.txt');
  fs.mkdirSync(path.dirname(source));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module', main: source }));
  fs.writeFileSync(source, 'CAPTURED');
  fs.writeFileSync(path.join(root, 'src/compiler.mjs'), `import fs from 'node:fs';
    import {readFile} from 'node:fs/promises';
    export default async ({path}) => {
      const sync = fs.readFileSync(new URL('file://' + path), 'utf8');
      const callback = await new Promise((resolve, reject) => fs.readFile(Buffer.from(path), 'utf8', (err, value) => err ? reject(err) : resolve(value)));
      const promise = await readFile(path, 'utf8');
      return [{entity: 'Row', name: [sync, callback, promise].join(':')}];
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
      expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main).toBe(source);
      const output = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'rows.content.json'), 'utf8'));
      expect(output.records[0].name).toBe('CAPTURED:CAPTURED:CAPTURED');
      fs.writeFileSync(path.join(outputDirectory, 'live.txt'), 'FIRST');
      expect(fs.readFileSync(path.join(outputDirectory, 'live.txt'), 'utf8')).toBe('FIRST');
      fs.writeFileSync(path.join(outputDirectory, 'live.txt'), 'SECOND');
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
