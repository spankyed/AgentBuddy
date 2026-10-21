import { expect } from '@apackdev/testing';
import type { Page } from '@playwright/test';

/** The registration this window accepted for a pack's frontend, absent while none is loaded */
export const acceptedRuntime = (page: Page, packId: string): Promise<string | undefined> => page.evaluate(packId =>
  (window as any).applicationState.getSnapshot().context.acceptedPackRuntimes[packId], packId);

/**
 * Waits until the window accepts a frontend for the pack other than `previous`. Enabling a pack registers and
 * activates it and then reloads its frontend, so what that frontend renders (its plugins, its settings form, its
 * steps) appears only once the shell has accepted the new runtime — seconds after the toggle on a hosted runner.
 */
export async function frontendAccepted(page: Page, packId: string, previous: string | undefined): Promise<void> {
  await expect.poll(async () => {
    const current = await acceptedRuntime(page, packId);
    return current !== undefined && current !== previous;
  }, { timeout: 30_000, message: `${packId} frontend accepted after reactivation` }).toBe(true);
}
