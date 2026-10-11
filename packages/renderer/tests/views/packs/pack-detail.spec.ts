import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type App } from 'vue';
import type { PackInfo } from '@apack/host/fe';
import PackDetail from '@/views/packs/PackDetail.vue';

/** An installed external pack with nothing declared, and `overrides` */
const pack = (overrides: Partial<PackInfo> = {}): PackInfo => ({
  id: 'memo-pack', name: 'Memos', version: '1.0.0', canUninstall: true, enabled: true,
  entities: {}, relKinds: {}, features: [], services: [], steps: [], artifacts: [], blocks: [], systems: [],
  permissions: [], bootHooks: [], migrationCount: 0, contentOffers: [], contentKept: [],
  ...overrides,
} as unknown as PackInfo);

let app: App | undefined;
function render(props: { pack: PackInfo }): HTMLElement {
  const el = document.createElement('div');
  app = createApp(PackDetail, props);
  app.mount(el);
  return el;
}
afterEach(() => app?.unmount());

// A pack the app skipped at load (a build in another format, a runtime that threw) is installed and enabled, but
// runs nothing: its status says so, with the loader's reason, rather than "Enabled"
describe('an installed pack in the Packs view', () => {
  it("shows why it didn't load, in place of its status", () => {
    const el = render({ pack: pack({ loadProblem: 'its snapshot is format 2, written by a newer apack CLI; update apack to use it' }) });

    expect(el.querySelector('[data-testid="pack-load-problem"]')?.textContent?.trim())
      .toBe('Failed to load: its snapshot is format 2, written by a newer apack CLI; update apack to use it');
    expect(el.textContent).not.toContain('Enabled');
  });

  it('shows its status when it loaded', () => {
    const el = render({ pack: pack() });

    expect(el.querySelector('[data-testid="pack-load-problem"]')).toBeNull();
    expect(el.textContent).toContain('Enabled');
  });
});

/**
 * **The two kinds of decision a pack's content can leave the user, and the buttons each one gets.** The
 * view decides nothing — it emits the content key and the system writes — so what is worth holding here is
 * that an item whose newer version is waiting can be taken and an item the pack dropped cannot: there is
 * no version to take, only the choice between keeping it and deleting it.
 */
describe('the decisions a pack’s content leaves the user', () => {
  const offers = {
    contentOffers: [
      { key: 'memo-pack:actions/a', label: 'actions / Action "Echo"', kind: 'update' as const, parts: ['actionFn'], contentHash: 'echo-v2' },
      { key: 'memo-pack:actions/b', label: 'actions / Action "Gone"', kind: 'removed' as const, parts: ['inputs'] },
    ],
  };

  it('offers the newer version of an item the user changed, naming the parts they changed', () => {
    const el = render({ pack: pack(offers) });
    const [update] = [...el.querySelectorAll('[data-testid="pack-content-offer"]')];

    expect(update!.textContent).toContain('actions / Action "Echo"');
    expect(update!.textContent, 'the pack and the version it would write').toContain('Memos v1.0.0');
    expect(update!.querySelector('[data-testid="offer-take"]')).toBeTruthy();
    expect(update!.querySelector('[data-testid="offer-keep"]')).toBeTruthy();
    expect(update!.querySelector('[data-testid="offer-delete"]'), 'nothing was removed, so there is nothing to delete').toBeNull();
  });

  it('offers to keep or delete an item the pack no longer ships, and no version to take', () => {
    const el = render({ pack: pack(offers) });
    const removed = [...el.querySelectorAll('[data-testid="pack-content-offer"]')][1];

    expect(removed!.textContent).toContain('no longer ships it');
    expect(removed!.querySelector('[data-testid="offer-take"]'), 'there is no newer version to take').toBeNull();
    expect(removed!.querySelector('[data-testid="offer-keep"]')).toBeTruthy();
    expect(removed!.querySelector('[data-testid="offer-delete"]')).toBeTruthy();
  });

  it('offers to reset an item the user kept their own version of, and nothing when there are none', () => {
    const kept = render({ pack: pack({ contentKept: [{ key: 'memo-pack:actions/a', label: 'actions / Action "Echo"' }] }) });
    expect(kept.querySelector('[data-testid="kept-reset"]')).toBeTruthy();

    const none = render({ pack: pack() });
    expect(none.querySelector('[data-testid="pack-content-offers"]')).toBeNull();
    expect(none.querySelector('[data-testid="pack-content-kept"]')).toBeNull();
  });
});
