import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type App } from 'vue';
import type { PackInfo } from '@abuddy/host/fe';
import PackDetail from '@/views/packs/PackDetail.vue';

/** An installed external pack with nothing declared, and `overrides` */
const pack = (overrides: Partial<PackInfo> = {}): PackInfo => ({
  id: 'memo-pack', name: 'Memos', version: '1.0.0', builtIn: false, enabled: true,
  entities: {}, relKinds: {}, features: [], services: [], steps: [], artifacts: [], blocks: [], systems: [],
  permissions: [], bootHooks: [], migrationCount: 0,
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
    const el = render({ pack: pack({ loadProblem: 'its snapshot is format 2, written by a newer abuddy CLI; update AgentBuddy to use it' }) });

    expect(el.querySelector('[data-testid="pack-load-problem"]')?.textContent?.trim())
      .toBe('Failed to load: its snapshot is format 2, written by a newer abuddy CLI; update AgentBuddy to use it');
    expect(el.textContent).not.toContain('Enabled');
  });

  it('shows its status when it loaded', () => {
    const el = render({ pack: pack() });

    expect(el.querySelector('[data-testid="pack-load-problem"]')).toBeNull();
    expect(el.textContent).toContain('Enabled');
  });
});
