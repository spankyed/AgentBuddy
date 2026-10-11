import { test, expect } from '@apackdev/testing';

test('standalone Help searches bundled articles and opens feature help', async ({ app, appPage }) => {
  await app.navigate('host/help');
  const reader = appPage.getByTestId('help-reader');
  await expect(reader.getByRole('button', { name: 'Why does the PR panel say my GitHub token is missing permissions?' })).toBeVisible();
  await reader.getByRole('textbox', { name: 'Search help' }).fill('fine-grained');
  await expect(reader.getByRole('button', { name: 'Why does the PR panel say my GitHub token is missing permissions?' })).toBeVisible();
  await expect(reader.getByRole('button', { name: 'How do I enable TTS?' })).toHaveCount(0);
  await reader.getByRole('button', { name: 'Why does the PR panel say my GitHub token is missing permissions?' }).click();
  await expect(reader.getByTestId('help-article-title')).toContainText('GitHub token');
  await app.navigate('host/settings');
  await appPage.evaluate(() => (window as any).applicationState.system.get('host/settings').send({ type: 'PLUGIN.SELECT', pluginId: 'default-setup/code' }));
  await appPage.evaluate(() => (window as any).applicationState.system.get('host/settings').send({ type: 'TAB.SELECT', tab: 'plugins' }));
  await appPage.getByTestId('feature-help').click();
  await expect(reader.getByRole('combobox', { name: 'Filter help by feature' })).toHaveValue('default-setup/code');
});

test('unavailable help targets explain the problem and return to the index', async ({ app, appPage }) => {
  await app.navigate('host/help');
  await appPage.evaluate(() => (window as any).applicationState.system.get('host/help').send({ type: 'HELP.OPEN', target: { packId: 'missing-pack', articleId: 'missing' } }));
  await expect(appPage.getByRole('heading', { name: 'Article unavailable' })).toBeVisible();
  await appPage.getByRole('button', { name: 'Browse all help' }).click();
  await expect(appPage.getByRole('heading', { name: 'How can we help?' })).toBeVisible();
});
