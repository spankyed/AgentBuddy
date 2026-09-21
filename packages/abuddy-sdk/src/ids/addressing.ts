/**
 * A pack's feature is `<packId>/<featureId>`, one spelling everywhere: in code, on the bus, in storage, in logs
 * and in actions. A feature contributes at most one system and one plugin, and both run under it. Bare ids are
 * the host's (`bus`, `HOST_PLUGIN_IDS`). A pack id is `^[a-z][a-z0-9-]*$` and a feature id letters and digits,
 * so neither holds a `/`: a ref splits one way, and no pack can produce one in another pack's namespace.
 *
 * Code names its own features by feature id and another pack's by ref; resolving a name only makes a relative
 * name absolute.
 */
declare const featureRef: unique symbol;

/**
 * A feature's ref, `<packId>/<featureId>`, or a bare id the host owns. Branded, so a name code wrote can't be
 * passed where a resolved ref belongs: one is made only by `resolveName` (or `asHostAddress` for the host's
 * own bare ids).
 */
export type FeatureRef = string & { readonly [featureRef]: true };

/** A bare id the host owns (`application`, `packs`, `bus`), as the ref it is */
export function asHostAddress(id: string): FeatureRef {
  return id as FeatureRef;
}

/** The pack and feature a ref names, or undefined for a string that isn't one (a bare host id, a name) */
export function splitRef(ref: string): { packId: string; featureId: string } | undefined {
  const slash = ref.indexOf('/');
  if (slash <= 0 || slash === ref.length - 1 || ref.indexOf('/', slash + 1) >= 0) return undefined;
  return { packId: ref.slice(0, slash), featureId: ref.slice(slash + 1) };
}

/** Where a name is being resolved: the pack whose code wrote it, and the bare ids the host owns there */
export interface NameContext {
  packId?: string;
  hostIds?: readonly string[];
}

/**
 * The feature a name refers to, in the context of the pack that wrote it:
 * - `<packId>/<featureId>` is that pack's feature;
 * - a host id is the host's, bare;
 * - any other bare name is the writing pack's own feature.
 * A bare name with no pack to belong to throws.
 */
export function resolveName(name: string, { packId, hostIds = [] }: NameContext = {}): FeatureRef {
  if (name.includes('/')) return name as FeatureRef;
  if (hostIds.includes(name)) return name as FeatureRef;
  if (!packId) throw new Error(`"${name}" names no pack's feature: write "<packId>/${name}"`);
  return `${packId}/${name}` as FeatureRef;
}
