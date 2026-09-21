/**
 * How a pack's feature is addressed at runtime.
 *
 * A feature contributes at most one system and one plugin, and both run under `<packId>.<featureId>`.
 * Bare ids are the host's (`bus`, `HOST_PLUGIN_IDS`). A pack id is `^[a-z][a-z0-9-]*$` and a feature id
 * letters and digits, so neither holds a dot: an address parses one way, and no pack can produce one in
 * another pack's namespace or the host's.
 *
 * Code names a feature two ways: its own by feature id, another pack's as `<packId>/<featureId>`. The
 * address is always derived from the name, never looked up, so nothing needs a table of them.
 */
export function qualifiedId(packId: string, featureId: string): string {
  return `${packId}.${featureId}`;
}

/** The pack and feature an address names, or undefined for a string that isn't one (a bare host id, a name) */
export function parseAddress(address: string): { packId: string; featureId: string } | undefined {
  const dot = address.indexOf('.');
  if (dot <= 0 || dot === address.length - 1) return undefined;
  return { packId: address.slice(0, dot), featureId: address.slice(dot + 1) };
}

/** The address a `<packId>/<featureId>` name refers to; any other name is already an address */
export function addressOf(name: string): string {
  const slash = name.indexOf('/');
  return slash < 0 ? name : qualifiedId(name.slice(0, slash), name.slice(slash + 1));
}

/** A feature's address, `<packId>.<featureId>`, or a bare id the host owns */
export type FeatureAddress = string;

/** Where a name is being resolved: the pack whose code wrote it, and the bare ids the host owns there */
export interface NameContext {
  packId?: string;
  hostIds?: readonly string[];
}

/**
 * The address a name refers to, in the context of the pack that wrote it:
 * - an address (it holds a `.`, which no name can) is itself;
 * - `<packId>/<featureId>` is that pack's feature;
 * - a host id is the host's, bare;
 * - any other bare name is the writing pack's own feature.
 * A bare name with no pack to belong to throws, rather than being taken for an address.
 */
export function resolveName(name: string, { packId, hostIds = [] }: NameContext = {}): FeatureAddress {
  if (name.includes('.')) return name;
  if (name.includes('/')) return addressOf(name);
  if (hostIds.includes(name)) return name;
  if (!packId) {
    throw new Error(`"${name}" names no pack's feature: write "<packId>/${name}", or the address "<packId>.${name}"`);
  }
  return qualifiedId(packId, name);
}
