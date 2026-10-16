import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import { formatReferenceHref } from '@apackdev/sdk/framework';
import { test, expect } from '@apackdev/testing';

interface TestWindow {
  __sendToSystem(systemId: string, event: Record<string, unknown>): void;
  applicationState: {
    system: { get(id: string): { getSnapshot(): { context: { notes?: Array<{ id: string; title: string }> } } } | undefined };
  };
}

async function send(page: Page, feature: string, event: Record<string, unknown>) {
  await page.evaluate(({ feature, event }) => {
    (window as unknown as TestWindow).__sendToSystem(`default-setup/${feature}`, event);
  }, { feature, event });
}

test('a reference in a stored thread message opens its note in another feature', async ({ app, appPage }) => {
  const unique = randomUUID();
  const threadId = `Thread-reference-${unique}`;
  const title = `Reference destination ${unique}`;
  const body = `Stored note content ${unique}`;
  const label = `Saved reference ${unique}`;
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-reference-message-')));
  let noteId: string | undefined;
  let imported = false;
  try {
    await app.waitForPlugin('default-setup/notes');
    await app.navigate('default-setup/notes');
    await send(appPage, 'notes', { type: 'CREATE_NOTE', title, content: body });
    await expect.poll(async () => {
      noteId = await appPage.evaluate(title => (window as unknown as TestWindow).applicationState.system
        .get('default-setup/notes')?.getSnapshot().context.notes?.find(note => note.title === title)?.id, title);
      return noteId;
    }).toBeTruthy();

    // Use the public import operation to persist a message without running an inference turn.
    fs.writeFileSync(path.join(directory, 'exported-threads.json'), JSON.stringify({
      version: 2,
      threads: [{ id: threadId, topic: `Stored reference ${unique}`, instructions: '', status: 'Backlog',
        tags: [], shortCode: '', timestamp: Date.now(), linkedThreads: [], artifacts: [],
        messages: [{ sender: 'assistant', timestamp: Date.now(),
          text: `[${label}](${formatReferenceHref({ type: 'note', id: noteId! })})` }] }],
    }));
    await send(appPage, 'threads', { type: 'IMPORT_THREADS', directory });
    imported = true;
    await app.sendEvent({ type: 'OPEN_ENTITY', id: threadId });
    await expect(appPage.getByPlaceholder('Enter thread topic')).toHaveValue(`Stored reference ${unique}`);
    await appPage.getByText('Messages (1)', { exact: true }).click();
    const reference = appPage.locator('.messages-container .reference-pill').filter({ hasText: label });
    await expect(reference).toBeVisible();

    // Reload the view from the backend before clicking: a preview or optimistic message is insufficient.
    await app.navigate('default-setup/notes');
    await app.sendEvent({ type: 'OPEN_ENTITY', id: threadId });
    await expect(appPage.getByPlaceholder('Enter thread topic')).toHaveValue(`Stored reference ${unique}`);
    await appPage.getByText('Messages (1)', { exact: true }).click();
    await reference.click();
    const canvas = appPage.getByTestId('notes-canvas');
    await expect(canvas.getByPlaceholder('Untitled', { exact: true })).toHaveValue(title);
    await expect(canvas.locator('.tiptap')).toContainText(body);
  } finally {
    if (imported) await send(appPage, 'threads', { type: 'DELETE_THREAD', threadId });
    if (noteId) await send(appPage, 'notes', { type: 'DELETE_NOTE', id: noteId });
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
