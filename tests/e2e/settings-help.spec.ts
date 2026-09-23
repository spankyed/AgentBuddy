import { test, expect } from './fixtures/app';

// Help is a pack contribution: the pack reads its compiled entries, the host collects them and the app's Settings
// view renders them. Only a running app crosses all three, which is how the view kept reading a context field the
// machine had renamed — every entry held and none shown, with nothing to fail.
test("the Help tab shows the entries the installed packs contribute", async ({ app, appPage }) => {
  await app.navigate('host/settings');
  await appPage.evaluate(() =>
    (window as any).applicationState.system.get('host/settings').send({ type: 'TAB.SELECT', tab: 'help' }));

  const questions: string[] = await appPage.evaluate(() =>
    (window as any).applicationState.system.get('host/settings').getSnapshot().context.help.map((e: { question: string }) => e.question));
  expect(questions.length).toBeGreaterThan(0);

  for (const question of questions) {
    await expect(appPage.getByRole('button').filter({ hasText: question })).toHaveCount(1);
  }
});
