export type Designations = readonly string[] | Record<string, string>;

const registry = new Map<string, string>();

export function registerDesignations(designations: Designations): void {
  if (Array.isArray(designations)) {
    for (const role of designations) registry.set(role, role);
  } else {
    for (const [role, id] of Object.entries(designations)) registry.set(role, id);
  }
}

export function unregisterDesignations(designations: Designations): void {
  if (Array.isArray(designations)) {
    for (const role of designations) registry.delete(role);
  } else {
    for (const role of Object.keys(designations)) registry.delete(role);
  }
}

export function getDesignated(role: string): string {
  const id = registry.get(role);
  if (!id) throw new Error(`No feature designated for "${role}". Ensure a pack declares this designation.`);
  return id;
}

export function hasDesignation(role: string): boolean {
  return registry.has(role);
}
