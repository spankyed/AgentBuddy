/**
 * Whether `id` can name a plugin to pop out: a pack's plugin, `<packId>/<featureId>`, or a host plugin's bare
 * id. It reaches the popout's URL, so anything else is refused before a window is made for it.
 */
export function isPluginId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)?$/.test(id);
}
