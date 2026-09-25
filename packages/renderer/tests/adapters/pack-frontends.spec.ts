// This window's half of loading a pack's frontend: the stylesheet in the document. The rules are the host's
// (`fe/packs/frontends.ts`); what this covers is the document itself, which only this window has.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { packFrontendIO } from '@/adapters/pack-frontends';

const links = () => [...document.querySelectorAll('link[data-pack-id]')] as HTMLLinkElement[];

/** Adds a stylesheet and lets the element report the outcome the browser would */
function add(packId: string, href: string, outcome: 'load' | 'error' = 'load'): Promise<void> {
  const added = packFrontendIO.styles.add(packId, href);
  const link = links().find((el) => el.href.endsWith(href) && el.dataset.packId === packId);
  link?.[outcome === 'load' ? 'onload' : 'onerror']?.(new Event(outcome));
  return added;
}

afterEach(() => {
  links().forEach((el) => el.remove());
  vi.restoreAllMocks();
});

describe("a pack's stylesheet", () => {
  it('is one link for the pack, with the pack on it, and is waited for', async () => {
    await add('ext', 'pack://ext/runtime/fe.css');

    expect(links()).toHaveLength(1);
    expect(links()[0].rel).toBe('stylesheet');
    expect(links()[0].dataset.packId).toBe('ext');
    expect(links()[0].href).toContain('pack://ext/runtime/fe.css');
  });

  // A pack whose frontend is only styles reports no plugins, so every later load run reaches it again
  it('is added once however often the same pack asks for it', async () => {
    await add('ext', 'pack://ext/runtime/fe.css');
    await add('ext', 'pack://ext/runtime/fe.css');

    expect(links()).toHaveLength(1);
  });

  // The URL carries the frontend's revision, so an updated pack's stylesheet is a different one
  it('is added again for another href, and for another pack', async () => {
    await add('ext', 'pack://ext/runtime/fe.css');
    await add('ext', 'pack://ext/runtime/fe.css?v=2');
    await add('other', 'pack://ext/runtime/fe.css');

    expect(links()).toHaveLength(3);
  });

  it("goes on when it can't be loaded, saying which pack's it was", async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await add('ext', 'pack://ext/missing.css', 'error');

    expect(warned).toHaveBeenCalled();
  });

  it("is taken out with the pack, and leaves another pack's", async () => {
    await add('ext', 'pack://ext/runtime/fe.css');
    await add('other', 'pack://other/runtime/fe.css');

    packFrontendIO.styles.remove('ext');

    expect(links().map((el) => el.dataset.packId)).toEqual(['other']);
  });
});
