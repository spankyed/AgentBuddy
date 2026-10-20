// This window's half of loading a pack's frontend: importing a module from `pack://` and putting a stylesheet in the
// document. The rules around both — which URL, what counts as a registration, what unloading undoes — are the host's
// (`@apackdev/host/fe`, `fe/packs/frontends.ts`), which takes this as its I/O.
import type { PackFrontendIO, PackFrontendStyle } from '@apackdev/host/fe';
import devFrontends from 'virtual:dev-pack-frontends';
import { settingsForPack } from '@/runtime/settings';

interface StyleEntry {
  link: HTMLLinkElement;
  ready: Promise<void>;
  state: 'pending' | 'ready' | 'failed';
  leases: Set<PackFrontendStyle>;
  fail(error: Error): void;
}

const styles = new Map<string, Map<string, StyleEntry>>();
const activeStyles = new Map<string, PackFrontendStyle>();

function prepareStyle(packId: string, href: string): PackFrontendStyle {
  let pool = styles.get(packId);
  if (!pool) { pool = new Map(); styles.set(packId, pool); }
  let entry = pool.get(href);
  let append = false;
  if (!entry) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.media = 'not all';
    link.dataset.packId = packId;
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const ready = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const candidate: StyleEntry = { link, ready, state: 'pending', leases: new Set(), fail(error) {
      if (candidate.state !== 'pending') return;
      candidate.state = 'failed';
      link.onload = link.onerror = null;
      link.remove();
      if (pool!.get(href) === candidate) pool!.delete(href);
      reject(error);
    } };
    link.onload = () => {
      if (candidate.state !== 'pending') return;
      candidate.state = 'ready';
      link.onload = link.onerror = null;
      resolve();
    };
    link.onerror = () => candidate.fail(new Error(`Failed to load styles for pack "${packId}"`));
    entry = candidate;
    pool.set(href, entry);
    append = true;
  }
  const owned = entry;
  let disposed = false;
  let cancel!: (error: Error) => void;
  const cancellation = new Promise<never>((_resolve, reject) => { cancel = reject; });
  const ready = Promise.race([owned.ready, cancellation]);
  // Explicit disposal may happen before a caller starts awaiting readiness.
  void ready.catch(() => {});
  const lease: PackFrontendStyle = {
    ready,
    commit() {
      if (disposed || owned.state !== 'ready') throw new Error(`Styles for pack "${packId}" are not ready to commit`);
      owned.link.media = 'all';
      activeStyles.set(packId, lease);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel(new Error(`Styles for pack "${packId}" were unloaded before loading`));
      if (activeStyles.get(packId) === lease) {
        activeStyles.delete(packId);
        owned.link.media = 'not all';
      }
      owned.leases.delete(lease);
      if (!owned.leases.size) {
        owned.fail(new Error(`Styles for pack "${packId}" were unloaded before loading`));
        owned.link.remove();
        if (pool!.get(href) === owned) pool!.delete(href);
        if (!pool!.size && styles.get(packId) === pool) styles.delete(packId);
      }
    },
  };
  owned.leases.add(lease);
  if (append) {
    try { document.head.appendChild(owned.link); }
    catch (error) { lease.dispose(); throw error; }
  }
  return lease;
}

export const packFrontendIO: PackFrontendIO = {
  settingsForPack,
  importModule: (url) => import(/* @vite-ignore */ url),
  devFrontends,
  styles: {
    prepare: prepareStyle,
    remove(packId) {
      for (const entry of styles.get(packId)?.values() ?? []) {
        for (const lease of entry.leases) lease.dispose();
      }
    },
  },
};
