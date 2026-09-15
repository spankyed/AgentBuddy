import type { Plugin } from '@/core/types';
import { registerPackFE, type PackFERegistration } from '@abuddy/host/fe';

export interface PackPluginManifest {
  id: string;
  entry: string;
  label: string;
  icon: string;
  designation?: string;
}

async function resolveLucideIcon(iconName: string): Promise<any> {
  try {
    const lucide = await import('lucide-vue-next');
    return (lucide as any)[iconName] || null;
  } catch {
    return null;
  }
}

export function loadPackStyles(packId: string, stylesPath: string, packBaseUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${packBaseUrl}/${stylesPath}`;
    link.dataset.packId = packId;
    link.onload = () => resolve();
    link.onerror = () => {
      console.warn(`[pack-loader] Failed to load styles for pack ${packId}`);
      resolve();
    };
    document.head.appendChild(link);
  });
}

const REGISTRATION_KEYS = ['plugins', 'steps', 'artifacts', 'blocks', 'tiptapPlugins', 'appExtensions'] as const;

export async function loadPackFEEntry(
  entry: string,
  packBaseUrl: string,
): Promise<PackFERegistration | null> {
  const url = `${packBaseUrl}/${entry}`;
  try {
    const mod = await import(/* @vite-ignore */ url);
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
  } catch (err) {
    // The pack:// URL names the pack; the E2E fixture matches on it
    console.error(`[pack-loader] Failed to load FE entry ${url}:`, err);
    return null;
  }
}

export async function loadPackPlugin(
  manifest: PackPluginManifest,
  packBaseUrl: string,
): Promise<Plugin | null> {
  try {
    const pluginUrl = `${packBaseUrl}/${manifest.entry}`;
    const mod = await import(/* @vite-ignore */ pluginUrl);
    const plugin = mod.default || mod;

    if (!plugin.id || !plugin.state || !plugin.canvas) {
      console.warn(`[pack-loader] Invalid plugin from ${manifest.id}: missing required fields`);
      return null;
    }

    if (typeof manifest.icon === 'string' && !plugin.icon) {
      plugin.icon = await resolveLucideIcon(manifest.icon);
    }

    if (manifest.designation && !plugin.designation) {
      plugin.designation = manifest.designation;
    }

    return plugin as Plugin;
  } catch (err) {
    console.error(`[pack-loader] Failed to load plugin ${manifest.id}:`, err);
    return null;
  }
}

export async function loadPackPlugins(
  manifests: PackPluginManifest[],
  packBaseUrl: string,
): Promise<Plugin[]> {
  const results = await Promise.allSettled(
    manifests.map(m => loadPackPlugin(m, packBaseUrl))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<Plugin | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((p): p is Plugin => p !== null);
}

/** An external pack's frontend, as the pack registry lists it */
export interface PackFrontend {
  id: string;
  feEntry?: string;
  feStyles?: string;
  plugins: PackPluginManifest[];
}

/**
 * Loads an external pack's frontend: its styles, then its FE entry or, without one, its plugin entries,
 * registering what it contributes. Returns the plugins it exports (none when it failed to load), or null
 * for a pack without frontend code: the bus sent its systems the connection's CLIENT_CONNECTED already.
 */
export async function loadPackFrontend(pack: PackFrontend): Promise<Plugin[] | null> {
  const packBaseUrl = `pack://${pack.id}`;
  if (pack.feStyles) await loadPackStyles(pack.id, pack.feStyles, packBaseUrl);
  if (!pack.feEntry && pack.plugins.length === 0) return null;

  try {
    if (pack.feEntry) {
      const registration = await loadPackFEEntry(pack.feEntry, packBaseUrl);
      if (!registration) return [];
      registerPackFE(registration, pack.id);
      return registration.plugins ?? [];
    }
    const plugins = await loadPackPlugins(pack.plugins, packBaseUrl);
    if (plugins.length > 0) registerPackFE({ plugins }, pack.id);
    return plugins;
  } catch (err) {
    console.error(`[pack-loader] Failed to load the frontend of pack ${pack.id}:`, err);
    return [];
  }
}
