// This window's half of loading a pack's frontend: the stylesheet in the document. The rules are the host's
// (`fe/packs/frontends.ts`); what this covers is the document itself, which only this window has.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { packFrontendIO } from '@/adapters/pack-frontends';

const stylesheetUrl = (packId = 'ext', revision = 'a') => `pack://${packId}/artifacts/${revision.repeat(64)}/runtime/fe.css`;
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
    await add('ext', stylesheetUrl());

    expect(links()).toHaveLength(1);
    expect(links()[0].rel).toBe('stylesheet');
    expect(links()[0].dataset.packId).toBe('ext');
    expect(links()[0].href).toContain(stylesheetUrl());
  });

  // A pack whose frontend is only styles reports no plugins, so every later load run reaches it again
  it('is added once however often the same pack asks for it', async () => {
    await add('ext', stylesheetUrl());
    await add('ext', stylesheetUrl());

    expect(links()).toHaveLength(1);
  });

  // The URL carries the frontend's revision, so an updated pack's stylesheet is a different one
  it('is added again for another href, and for another pack', async () => {
    await add('ext', stylesheetUrl());
    await add('ext', stylesheetUrl('ext', 'b'));
    await add('other', stylesheetUrl());

    expect(links()).toHaveLength(3);
  });

  it('rejects a failed load, removes its link and allows retry', async () => {
    await expect(add('ext', stylesheetUrl().replace('fe.css', 'missing.css'), 'error')).rejects.toThrow('Failed to load styles for pack "ext"');
    expect(links()).toEqual([]);
    await add('ext', stylesheetUrl().replace('fe.css', 'missing.css'));
    expect(links()).toHaveLength(1);
  });

  it('waits for the same pending outcome when another caller requests the stylesheet', async () => {
    const first = packFrontendIO.styles.add('ext', stylesheetUrl().replace('fe.css', 'pending.css'));
    const second = packFrontendIO.styles.add('ext', stylesheetUrl().replace('fe.css', 'pending.css'));
    let settled = false;
    void second.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    links()[0].onload?.(new Event('load'));
    await Promise.all([first, second]);
    expect(settled).toBe(true);
  });

  it('settles a pending load when its pack is unloaded', async () => {
    const pending = packFrontendIO.styles.add('ext', stylesheetUrl().replace('fe.css', 'pending.css'));
    packFrontendIO.styles.remove('ext');
    await expect(pending).rejects.toThrow('unloaded before loading');
    expect(links()).toEqual([]);
  });

  it("is taken out with the pack, and leaves another pack's", async () => {
    await add('ext', stylesheetUrl('ext', 'b'));
    await add('other', stylesheetUrl('other', 'a'));

    packFrontendIO.styles.remove('ext');

    expect(links().map((el) => el.dataset.packId)).toEqual(['other']);
  });
});
