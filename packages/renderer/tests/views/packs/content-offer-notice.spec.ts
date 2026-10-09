// What a pack's row says about the decisions its content is waiting on. The detail is where they are
// answered; this is the only thing that says a pack has any without opening it.
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type App } from 'vue';
import ContentOfferNotice from '@/views/packs/ContentOfferNotice.vue';

let app: App | undefined;
function render(count: number): HTMLElement {
  const el = document.createElement('div');
  app = createApp(ContentOfferNotice, { count });
  app.mount(el);
  return el;
}
afterEach(() => app?.unmount());

const badge = (el: HTMLElement) => el.querySelector('[data-testid="pack-content-offer-count"]');

describe('a pack’s row with decisions waiting', () => {
  /** The failure this exists to avoid is a badge on a pack with nothing to decide */
  it('says nothing when there is nothing to decide', () => {
    expect(badge(render(0))).toBeNull();
  });

  /**
   * It says whose the items are and what to do, because the row carries two other counts of what the pack
   * holds and a bare number among them reads as a third.
   */
  it('says what has changed and that the pack is where to answer it', () => {
    expect(badge(render(1))?.textContent).toBe("You've changed 1 item this pack ships — open to review");
    expect(badge(render(3))?.textContent).toBe("You've changed 3 items this pack ships — open to review");
  });
});
