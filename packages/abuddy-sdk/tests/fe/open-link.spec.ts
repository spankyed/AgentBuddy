// A link opens the way the user chose, which the plugin playing the `browser` role knows from its own settings: the
// SDK hands it the link and reads no plugin's state itself.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openLink } from '../../src/fe/navigation.ts';
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts';

function bindWith(browserRole: string | undefined) {
  const received: unknown[] = [];
  const browser = { send: (event: unknown) => received.push(event) };
  const openExternal = vi.fn();
  (globalThis as any).window = { electronAPI: { shell: { openExternal } } };
  bindFeHost({
    application: { system: { get: (id: string) => (id === browserRole ? browser : undefined) } } as never,
    secrets: {} as never,
    transport: { sendIncoming() {} },
    packs: { designation: (role: string) => (role === 'browser' ? browserRole : undefined) } as never,
  });
  return { received, openExternal };
}

afterEach(() => {
  unbindFeHost();
  delete (globalThis as any).window;
});

describe('openLink', () => {
  it('hands the link to the plugin playing the browser role, which decides where it opens', () => {
    const { received, openExternal } = bindWith('default-setup/browser');
    openLink('https://example.com');
    expect(received).toEqual([{ type: 'LINK.OPEN', url: 'https://example.com' }]);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("opens it in the system's browser when no plugin plays the role", () => {
    const { openExternal } = bindWith(undefined);
    openLink('https://example.com');
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });
});
