// Settings → Import Pack Seeds end to end: a seeds directory compiled from default-setup's own seed
// entries (a notes markdown tree and the library compiler module), previewed from its seeds.json,
// imported with an item deselected, then imported again in keep-existing mode.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildPackConfigFromManifest, compilePack, type PackManifest } from '@abuddy/sdk/build';
import { test, expect } from './fixtures/app';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PACK_DIR = path.join(ROOT, 'packages/default-setup');
const RUN = Date.now().toString(36);

type PackSeedsImport = {
  status: string;
  preview: { seeds: Record<string, Array<{ key: string; childCount?: number }>> } | null;
  selection: Record<string, string[]>;
  result: Record<string, { created: number; updated: number; skipped: number; errors?: string[] }> | null;
  error: string | null;
};

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Compiles default-setup's notes and library entries over fresh sources into a seeds directory */
async function compileSeeds(work: string): Promise<string> {
  write(path.join(work, 'notes/e2e-plan/index.md'), `---\ntitle: E2E Plan ${RUN}\ntype: tasklist\n---\nThe plan.\n`);
  write(path.join(work, 'notes/e2e-plan/first-step.md'), `---\ntitle: E2E Step ${RUN}\ntype: task\n---\nDo it.\n`);
  write(path.join(work, 'notes/e2e-skipped.md'), `---\ntitle: E2E Skipped ${RUN}\n---\nNot imported.\n`);
  write(path.join(work, 'library/e2e-guide.md'), `---\nname: "E2E Guide ${RUN}"\ntags: [e2e]\n---\nA guide.\n`);

  const manifest = JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'abuddy.json'), 'utf-8')) as PackManifest;
  const seeds = manifest.boot!.seed!;
  const entry = (key: string, source: string) => ({ ...(seeds[key] as object), path: path.relative(PACK_DIR, source) });
  const pack = { ...manifest, steps: undefined, boot: { seed: { notes: entry('notes', path.join(work, 'notes')), library: entry('library', path.join(work, 'library')) } } } as PackManifest;
  const outputDir = path.join(work, 'compiled');
  const { tsImport } = await import('tsx/esm/api');
  await compilePack({
    packDir: PACK_DIR,
    outputDir,
    packConfig: await buildPackConfigFromManifest(pack, PACK_DIR),
    importModule: (file) => tsImport(file, import.meta.url) as Promise<Record<string, unknown>>,
  });
  return outputDir;
}

test('previews a compiled seeds directory by its seeds.json and imports the selected items', async ({ app, appPage }) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-import-seeds-'));
  try {
    const directory = await compileSeeds(work);
    await app.navigate('settings');

    const send = (event: Record<string, unknown>) => appPage.evaluate((e) => {
      (window as any).applicationState.system.get('settings').send(e);
    }, event);
    const importState = () => appPage.evaluate(() => (window as any).applicationState.system.get('settings').getSnapshot().context.packSeedsImport) as Promise<PackSeedsImport>;
    const waitForStatus = (status: string) => appPage.waitForFunction(
      (s) => ['error', s].includes((window as any).applicationState.system.get('settings').getSnapshot().context.packSeedsImport.status),
      status,
      { timeout: 20_000 },
    );

    await send({ type: 'PACK_SEEDS.PREVIEW', directory });
    await waitForStatus('selecting');
    const previewed = await importState();
    expect(previewed.error).toBeNull();
    expect(previewed.preview!.seeds).toEqual({
      library: [{ key: `E2E Guide ${RUN}` }],
      notes: [{ key: `E2E Plan ${RUN}`, childCount: 1 }, { key: `E2E Skipped ${RUN}` }],
    });
    expect(previewed.selection).toEqual({ library: [`E2E Guide ${RUN}`], notes: [`E2E Plan ${RUN}`, `E2E Skipped ${RUN}`] });

    await send({ type: 'PACK_SEEDS.TOGGLE_ITEM', key: 'notes', item: `E2E Skipped ${RUN}` });
    await send({ type: 'PACK_SEEDS.CONFIRM_IMPORT' });
    await waitForStatus('success');
    const imported = await importState();
    expect(imported.error).toBeNull();
    expect(imported.result!.notes).toEqual({ created: 2, updated: 0, skipped: 0 });
    expect(imported.result!.library).toEqual({ created: 1, updated: 0, skipped: 0 });

    // The same items again, keeping what exists: every imported row is found
    await send({ type: 'PACK_SEEDS.PREVIEW', directory });
    await waitForStatus('selecting');
    await send({ type: 'PACK_SEEDS.TOGGLE_ITEM', key: 'notes', item: `E2E Skipped ${RUN}` });
    await send({ type: 'PACK_SEEDS.SET_MODE', mode: 'keep-existing' });
    await send({ type: 'PACK_SEEDS.CONFIRM_IMPORT' });
    await waitForStatus('success');
    const kept = await importState();
    expect(kept.result!.notes).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(kept.result!.library).toEqual({ created: 0, updated: 0, skipped: 1 });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
