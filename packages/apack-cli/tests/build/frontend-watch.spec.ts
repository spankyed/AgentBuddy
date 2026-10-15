import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { _byDeadline } from '@apackdev/sdk/testing/waiting';
import { createFrontendWatcher } from '../../src/build/frontend-watch.ts';
import { readBuildWatchInputs } from '../../src/build/build-watch-inputs.ts';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function fixture() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-frontend-watch-'));
  const root = path.join(temporary, 'pack');
  fs.mkdirSync(root);
  let notify!: () => void;
  const firstChange = new Promise<void>(resolve => { notify = resolve; });
  const changed = vi.fn((_file: string) => notify());
  const watcher = createFrontendWatcher(root, path.join(temporary, 'profile'), changed);
  cleanups.push(() => fs.rmSync(temporary, { recursive: true, force: true }), () => watcher.close());
  const write = (file: string, text: string) => {
    const absolute = path.join(temporary, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, text);
    return absolute;
  };
  return { root, temporary, watcher, changed, firstChange, write };
}

it('uses file bytes for duplicate detection and watches outside resource edits', async () => {
  const { watcher, changed, firstChange, write } = fixture();
  const file = write('resources/style.css', 'before');
  await watcher.observe({ files: [file], directories: [], successful: true });
  const before = watcher.snapshot();
  const touch = new Date(Date.now() + 60_000);
  fs.utimesSync(file, touch, touch);
  expect(before.current()).toBe(true);
  write('resources/style.css', 'after');
  await _byDeadline(firstChange, 'the outside stylesheet change');
  expect(changed).toHaveBeenCalled();
  expect(before.current(), JSON.stringify(changed.mock.calls)).toBe(false);
});

it('keeps repair subscriptions through partial reports and observes nested missing targets', async () => {
  const { temporary, watcher, changed, write } = fixture();
  const stylesheet = write('styles/main.css', '@import "./future/theme.css";');
  await watcher.observe({ files: [stylesheet], directories: [], successful: true });
  await watcher.observe({ files: [path.join(temporary, 'styles/future/theme.css')], directories: [], successful: false });
  const before = watcher.snapshot();
  const repaired = write('styles/future/theme.css', '.theme {}');
  await vi.waitFor(() => expect(changed.mock.calls.some(([file]) => file === repaired || file.endsWith(`${path.sep}future`))).toBe(true));
  expect(before.current(), JSON.stringify(changed.mock.calls)).toBe(false);
});

it.each(['content', 'profile/content'])('observes compiler-reported empty directory %s gaining files', async relative => {
  const { temporary, watcher, changed, write } = fixture();
  const directory = path.join(temporary, relative);
  fs.mkdirSync(directory, { recursive: true });
  await watcher.observe({ files: [], directories: [directory], successful: true });
  const before = watcher.snapshot();
  write(`${relative}/nested/item.html`, '<div />');
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(before.current(), JSON.stringify(changed.mock.calls)).toBe(false);
});

it('accepts only the private worker message shape and absolute input paths', () => {
  const message = { type: 'apack:build-inputs', files: ['/tmp/style.css'], directories: [], successful: false };
  expect(readBuildWatchInputs(message)).toEqual({ files: message.files, directories: [], successful: false });
  expect(readBuildWatchInputs({ ...message, type: 'other' })).toBeUndefined();
  expect(readBuildWatchInputs({ ...message, files: ['relative.css'] })).toBeUndefined();
  expect(readBuildWatchInputs({ ...message, directories: [42] })).toBeUndefined();
});

it('rebuilds when a compiler-reported content directory link is retargeted', async () => {
  const { temporary, watcher, firstChange, write } = fixture();
  const original = path.dirname(write('sources/original/page.html', '<div />'));
  const replacement = path.dirname(write('sources/replacement/page.html', '<article />'));
  const link = path.join(temporary, 'content');
  fs.symlinkSync(original, link, 'dir');
  await watcher.observe({ files: [], directories: [link], successful: true });
  const before = watcher.snapshot();
  const next = path.join(temporary, 'next-content');
  fs.symlinkSync(replacement, next, 'dir');
  fs.renameSync(next, link);
  await _byDeadline(firstChange, 'the content directory link replacement');
  expect(before.current()).toBe(false);
});

it('ignores output/profile events beneath a broad parent and cannot reopen after close', async () => {
  const { root, temporary, watcher, changed, firstChange, write } = fixture();
  const file = write('style.css', 'before');
  const inputs = { files: [file], directories: [], successful: true };
  await watcher.observe(inputs);
  write('pack/dist/runtime/fe.css', 'output');
  write('profile/logs/app.log', 'app activity');
  write('style.css', 'after');
  await _byDeadline(firstChange, 'the resource event after ignored output/profile writes');
  expect(changed.mock.calls.filter(([file]) => !file.endsWith(`${path.sep}style.css`))).toEqual([]);
  await watcher.close();
  changed.mockClear();
  await watcher.observe(inputs);
  await watcher.accept(inputs);
  let notified!: () => void;
  const observed = new Promise<void>(resolve => { notified = resolve; });
  const control = createFrontendWatcher(root, path.join(temporary, 'profile'), () => notified());
  cleanups.push(() => control.close());
  await control.observe(inputs);
  write('style.css', 'closed');
  await _byDeadline(observed, 'the control watcher observing the same edit');
  expect(changed).not.toHaveBeenCalled();
});
