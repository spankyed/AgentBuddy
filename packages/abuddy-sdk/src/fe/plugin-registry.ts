const designations = new Map<string, string>();

export function registerDesignation(role: string, pluginId: string): void {
  designations.set(role, pluginId);
}

export function getDesignatedPlugin(role: string): string {
  const id = designations.get(role);
  if (!id) throw new Error(`No plugin designated for "${role}". Ensure a plugin declares this designation.`);
  return id;
}

export function hasDesignation(role: string): boolean {
  return designations.has(role);
}

export function registerPluginDesignations(plugins: { id: string; designations?: string[] }[]): void {
  for (const plugin of plugins) {
    if (plugin.designations) {
      for (const role of plugin.designations) {
        registerDesignation(role, plugin.id);
      }
    }
  }
}
