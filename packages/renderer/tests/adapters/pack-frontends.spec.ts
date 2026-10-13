import { afterEach, describe, expect, it } from 'vitest';
import { packFrontendIO } from '@/adapters/pack-frontends';

const stylesheetUrl = (packId = 'ext', revision = 'a') => `pack://${packId}/artifacts/${revision.repeat(64)}/runtime/fe.css`;
const links = () => [...document.querySelectorAll('link[data-pack-id]')] as HTMLLinkElement[];
const linkFor = (href: string) => links().find(link => link.href === href)!;
const load = (href: string) => linkFor(href).onload?.(new Event('load'));

afterEach(() => {
  for (const id of new Set(links().map(link => link.dataset.packId!))) packFrontendIO.styles.remove(id);
});

describe('owned pack styles', () => {
  it('loads an inert stylesheet and applies it only on commit', async () => {
    const href = stylesheetUrl();
    const lease = packFrontendIO.styles.prepare('ext', href);
    expect(links()).toHaveLength(1);
    expect(linkFor(href).media).toBe('not all');
    load(href);
    await lease.ready;
    expect(linkFor(href).media).toBe('not all');
    lease.commit();
    expect(linkFor(href).media).toBe('all');
    lease.dispose();
    expect(links()).toEqual([]);
  });

  it('shares the fetch while cancellation belongs to each attempt', async () => {
    const href = stylesheetUrl();
    const first = packFrontendIO.styles.prepare('ext', href);
    const second = packFrontendIO.styles.prepare('ext', href);
    expect(links()).toHaveLength(1);
    first.dispose();
    await expect(first.ready).rejects.toThrow('unloaded');
    expect(links()).toHaveLength(1);
    load(href);
    await second.ready;
    second.commit();
    expect(linkFor(href).media).toBe('all');
  });

  it('keeps an accepted stylesheet when a same-href candidate is disposed', async () => {
    const href = stylesheetUrl();
    const old = packFrontendIO.styles.prepare('ext', href);
    load(href);
    await old.ready;
    old.commit();
    const candidate = packFrontendIO.styles.prepare('ext', href);
    await candidate.ready;
    candidate.dispose();
    expect(links()).toHaveLength(1);
    expect(linkFor(href).media).toBe('all');
    old.dispose();
    expect(links()).toEqual([]);
  });

  it('transfers same-href ownership without an old disposal removing new styles', async () => {
    const href = stylesheetUrl();
    const old = packFrontendIO.styles.prepare('ext', href);
    load(href);
    await old.ready;
    old.commit();
    const next = packFrontendIO.styles.prepare('ext', href);
    await next.ready;
    next.commit();
    old.dispose();
    expect(links()).toHaveLength(1);
    expect(linkFor(href).media).toBe('all');
    next.dispose();
    expect(links()).toEqual([]);
  });

  it('retains old styles through another revision failing and permits retry', async () => {
    const href = stylesheetUrl();
    const old = packFrontendIO.styles.prepare('ext', href);
    load(href);
    await old.ready;
    old.commit();
    const nextHref = stylesheetUrl('ext', 'b');
    const candidate = packFrontendIO.styles.prepare('ext', nextHref);
    expect(linkFor(nextHref).media).toBe('not all');
    linkFor(nextHref).onerror?.(new Event('error'));
    await expect(candidate.ready).rejects.toThrow('Failed to load styles');
    candidate.dispose();
    expect(links()).toEqual([linkFor(href)]);
    expect(linkFor(href).media).toBe('all');
    const retry = packFrontendIO.styles.prepare('ext', nextHref);
    load(nextHref);
    await retry.ready;
    retry.commit();
    old.dispose();
    expect(links()).toEqual([linkFor(nextHref)]);
    expect(linkFor(nextHref).media).toBe('all');
  });

  it('refuses premature or disposed commits', async () => {
    const href = stylesheetUrl();
    const lease = packFrontendIO.styles.prepare('ext', href);
    expect(() => lease.commit()).toThrow('not ready');
    load(href);
    await lease.ready;
    lease.dispose();
    expect(() => lease.commit()).toThrow('not ready');
    expect(links()).toEqual([]);
  });

  it('unloads pending and accepted leases without affecting another pack', async () => {
    const old = packFrontendIO.styles.prepare('ext', stylesheetUrl());
    load(stylesheetUrl());
    await old.ready;
    old.commit();
    const pending = packFrontendIO.styles.prepare('ext', stylesheetUrl('ext', 'b'));
    const other = packFrontendIO.styles.prepare('other', stylesheetUrl('other'));
    load(stylesheetUrl('other'));
    await other.ready;
    other.commit();
    packFrontendIO.styles.remove('ext');
    await expect(pending.ready).rejects.toThrow('unloaded');
    expect(links()).toHaveLength(1);
    expect(links()[0].dataset.packId).toBe('other');
    expect(() => old.commit()).toThrow('not ready');
  });
});
