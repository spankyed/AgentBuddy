/** Compiled Monaco definition data must account for exactly the declared editor targets. */
export function dslDefinitionsProblem(
  declarations: Readonly<Record<string, { readonly targets: readonly string[] }>> | undefined,
  definitions: Readonly<Record<string, string>> | undefined,
): string | undefined {
  const names = Object.entries(declarations ?? {}).filter(([, entry]) => entry.targets.includes('monaco')).map(([name]) => name);
  if (!names.length) return definitions === undefined ? undefined : 'DSL definitions have no declared Monaco targets';
  for (const name of names) {
    if (!definitions || !Object.hasOwn(definitions, name)) return `Missing compiled Monaco definitions for DSL "${name}"`;
  }
  for (const name of Object.keys(definitions!)) {
    if (!names.includes(name)) return `Compiled Monaco definitions name undeclared DSL "${name}"`;
  }
}
