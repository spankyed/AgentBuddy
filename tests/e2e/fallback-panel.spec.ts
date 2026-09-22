import { test, expect } from './fixtures/app';

// A plugin offers its panel for plugins without one (`fallbackPanel`) and says itself when it shows: the brain's
// inspect mode. The app shell asks only through that, never reading the brain's state.
test("inspect mode shows the brain's panel beside a plugin that has none", async ({ app, appPage }) => {
  await app.navigate('default-setup/logs');
  const panel = appPage.locator('[data-onboarding-id="inspection-panel"]');
  await expect(panel).toHaveCount(0);

  await appPage.evaluate(() => (window as any).applicationState.system.get('default-setup/brain').send({ type: 'TOGGLE_INSPECT' }));

  await expect(panel).toBeVisible();

  await appPage.evaluate(() => (window as any).applicationState.system.get('default-setup/brain').send({ type: 'TOGGLE_INSPECT' }));
  await expect(panel).toHaveCount(0);
});
