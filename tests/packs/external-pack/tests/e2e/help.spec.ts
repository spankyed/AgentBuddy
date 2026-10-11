import { test, expect } from '@apackdev/testing';

test('installed pack help uses qualified IDs and follows internal article links', async ({ app, appPage }) => {
  await app.navigate('host/help');
  await appPage.evaluate(() => (window as any).applicationState.system.get('host/help').send({ type: 'HELP.OPEN', target: { packId: 'e2e-fixture', articleId: 'github-token-permissions' } }));
  await expect(appPage.getByTestId('help-article-title')).toHaveText('Fixture guide');
  await appPage.getByRole('link', { name: 'Next guide' }).click();
  await expect(appPage.getByTestId('help-article-title')).toHaveText('Next fixture guide');
  await appPage.getByRole('button', { name: 'Back to help index' }).click();
  await expect(appPage.getByTestId('help-article-title')).toHaveText('Fixture guide');
});
