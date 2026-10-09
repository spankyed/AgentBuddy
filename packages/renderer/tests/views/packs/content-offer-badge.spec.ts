// What a pack's row says about the decisions its content is waiting on. The detail is where they are
// answered; this is the only thing that says a pack has any without opening it.
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type App } from 'vue';
import ContentOfferBadge from '@/views/packs/ContentOfferBadge.vue';

let app: App | undefined;
function render(count: number): HTMLElement {
  const el = document.createElement('div');
  app = createApp(ContentOfferBadge, { count });
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

  it('counts them, and says what they are', () => {
    expect(badge(render(1))?.textContent).toBe('1 item');
    expect(badge(render(3))?.textContent).toBe('3 items');
  });
});
