import type { Plugin } from '@/core/types';
import { registerPackFE, unregisterPackFE, type PackFERegistration } from '@abuddy/host/fe';

export function loadPackStyles(packId: string, stylesPath: string, packBaseUrl: string): Promise<void> {
  const href = `${packBaseUrl}/${stylesPath}`;
  // A pack whose frontend is only styles reports no plugins, so a later load reaches it again; its
  // stylesheet is already here, and deactivating the pack removes it
  if (document.querySelector(`link[data-pack-id="${packId}"][href="${href}"]`)) return Promise.resolve();

  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.packId = packId;
    link.onload = () => resolve();
    link.onerror = () => {
      console.warn(`[pack-loader] Failed to load styles for pack ${packId}`);
      resolve();
    };
    document.head.appendChild(link);
  });
}

/** The host module a pack's generated proxy found missing (`<specifier> isn't provided by this AgentBuddy; …`) */
const MISSING_HOST_MODULE = /^(@abuddy\/\S+) isn't provided by this AgentBuddy/;

/**
 * Why a pack's FE entry failed to import, with what to do about it. A pack built against host modules this
 * app no longer provides fails in its proxy for one (newer builds name it; older ones read a property of
 * undefined), so the fix is rebuilding the pack.
 */
function importFailure(err: unknown): string {
  const reason = err instanceof Error ? err.message : String(err);
  const missing = MISSING_HOST_MODULE.exec(reason)?.[1];
  if (missing) return `It imports ${missing}, which this app doesn't provide: rebuild the pack with the current @abuddy/cli`;
  return `${reason}. If the pack was built for another AgentBuddy version, rebuild it with the current @abuddy/cli`;
}

const REGISTRATION_KEYS = ['plugins', 'steps', 'artifacts', 'blocks', 'tiptapPlugins', 'appExtensions'] as const;

/** Imports a pack's FE entry: its registration, or null when it exports none. Throws when the import fails. */
export async function loadPackFEEntry(
  entry: string,
  packBaseUrl: string,
): Promise<PackFERegistration | null> {
  const url = `${packBaseUrl}/${entry}`;
  let mod: { default?: unknown };
  try {
    mod = await import(/* @vite-ignore */ url);
  } catch (err) {
    const failure = importFailure(err);
    // The pack:// URL names the pack; the E2E fixture matches on it
    console.error(`[pack-loader] Failed to load FE entry ${url}: ${failure}`, err);
    throw new Error(failure);
  }
  const registration = mod.default || mod;
  if (!registration || typeof registration !== 'object') {
    console.warn(`[pack-loader] FE entry at ${entry} did not export a valid registration`);
    return null;
  }
  // A module without a default export falls back to its namespace object, which registers
  // nothing; say so instead of loading a pack whose plugins silently never appear. A default
  // export that declares registration fields, even empty ones, is deliberate: the generated
  // entry of a pack without FE contributions is { plugins: [], defaultPlugin: undefined }.
  const declaresRegistration = REGISTRATION_KEYS.some(key => key in registration);
  if (!mod.default || !declaresRegistration) {
    console.warn(
      `[pack-loader] FE entry ${url} registers nothing (no ${REGISTRATION_KEYS.join('/')}). ` +
      (mod.default ? 'Its default export declares none of them.' : 'It has no default export — export the registration as default.'),
    );
  }
  return registration as PackFERegistration;
}

/**
 * Undoes a pack's frontend load: its registered contributions and its stylesheets. Used when the pack is
 * deactivated, and when a load that was already running finished for a pack deactivated meanwhile.
 */
export function unloadPackFrontend(packId: string): void {
  unregisterPackFE(packId);
  document.querySelectorAll(`link[data-pack-id="${packId}"]`).forEach(el => el.remove());
}

/** An external pack's frontend, as the pack registry lists it: the bundle's runtime/fe.js and runtime/fe.css when it has them */
export interface PackFrontend {
  id: string;
  feEntry?: string;
  feStyles?: string;
}

/**
 * Loads an external pack's frontend: its styles, then its FE entry, registering what it contributes.
 * Returns the plugins it exports, or null for a pack without frontend code: the bus sent its systems the
 * connection's CLIENT_CONNECTED already. Throws when the entry fails to import or register, with a
 * message for the user.
 */
export async function loadPackFrontend(pack: PackFrontend): Promise<Plugin[] | null> {
  const packBaseUrl = `pack://${pack.id}`;
  if (pack.feStyles) await loadPackStyles(pack.id, pack.feStyles, packBaseUrl);
  if (!pack.feEntry) return null;

  const registration = await loadPackFEEntry(pack.feEntry, packBaseUrl);
  if (!registration) return [];
  registerPackFE(registration, pack.id);
  return registration.plugins ?? [];
}
