import type { Plugin } from '@/core/types';

export interface PackPluginManifest {
  id: string;
  entry: string;
  label: string;
  icon: string;
}

async function resolveLucideIcon(iconName: string): Promise<any> {
  try {
    const lucide = await import('lucide-vue-next');
    return (lucide as any)[iconName] || null;
  } catch {
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
