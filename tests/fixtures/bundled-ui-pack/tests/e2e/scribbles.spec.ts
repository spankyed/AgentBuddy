// A pack that bundles its own @abuddy/ui (abuddy.json fe.bundleUi): its editor shares the host's
// ProseMirror and tiptap core. Run via `npm run test:external-pack` from the repo root.
import { test, expect } from '@abuddy/testing';

test('renders and edits with its bundled @abuddy/ui editor', async ({ appPage, app }) => {
  const errors: string[] = [];
  appPage.on('pageerror', (error) => errors.push(error.message));
  appPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await app.waitForPlugin('scribbles');
  await app.navigate('scribbles');

  const editor = appPage.getByTestId('scribbles-editor').locator('.ProseMirror');
  await expect(editor).toContainText('Bundled editor', { timeout: 10_000 });
  await editor.click();
  await appPage.keyboard.press('End');
  await appPage.keyboard.type(' typed');
  await expect(appPage.getByTestId('scribbles-text')).toContainText('Bundled editor typed');
  // Two ProseMirror copies fail here ("Adding different instances of a keyed plugin", instanceof checks)
  expect(errors).toEqual([]);
});
