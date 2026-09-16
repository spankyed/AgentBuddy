/** Role → id of the system or plugin that plays it */
export type Designations = Record<string, string>;

const registry = new Map<string, string>();

/** @internal Host-only: the host registers a pack's designations when it loads the pack. */
export function registerDesignations(designations: Designations): void {
  for (const [role, id] of Object.entries(designations)) registry.set(role, id);
}

/** @internal Host-only: the host unregisters a pack's designations when it unloads the pack. */
export function unregisterDesignations(designations: Designations): void {
  for (const role of Object.keys(designations)) registry.delete(role);
}

export function getDesignated(role: string): string {
  const id = registry.get(role);
  if (!id) throw new Error(`No feature designated for "${role}". Ensure a pack declares this designation.`);
  return id;
}

export function hasDesignation(role: string): boolean {
  return registry.has(role);
}
