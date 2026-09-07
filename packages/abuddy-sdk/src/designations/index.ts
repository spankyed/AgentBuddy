const designations = new Map<string, string>();

export function registerDesignations(map: Record<string, string>): void {
  for (const [role, id] of Object.entries(map)) designations.set(role, id);
}

export function getDesignated(role: string): string {
  const id = designations.get(role);
  if (!id) throw new Error(`No feature designated for "${role}". Ensure a pack declares this designation.`);
  return id;
}

export function hasDesignation(role: string): boolean {
  return designations.has(role);
}
