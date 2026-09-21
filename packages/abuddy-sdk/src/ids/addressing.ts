/**
 * A pack's feature is `<packId>/<featureId>`, one spelling everywhere: in code, on the bus, in storage, in logs
 * and in actions. A feature contributes at most one system and one plugin, and both run under it. The app is a
 * pack too, `host` (`host/application`, `host/bus`), so there is no namespace of bare ids. A pack id is
 * `^[a-z][a-z0-9-]*$` and a feature id letters and digits, so neither holds a `/`: a ref splits one way, and no
 * pack can produce one in another pack's namespace.
 *
 * Code names its own features by feature id and every other feature by ref; resolving a name only makes a
 * relative name absolute.
 */
declare const featureRef: unique symbol;

/**
 * A feature's ref, `<packId>/<featureId>`. Branded, so a name code wrote can't be passed where a resolved ref
 * belongs: one is made only by `resolveName`.
 */
export type FeatureRef = `${string}/${string}` & { readonly [featureRef]: true };

/** The pack and feature a ref names, or undefined for a string that isn't one (a bare name) */
export function splitRef(ref: string): { packId: string; featureId: string } | undefined {
  const slash = ref.indexOf('/');
  if (slash <= 0 || slash === ref.length - 1 || ref.indexOf('/', slash + 1) >= 0) return undefined;
  return { packId: ref.slice(0, slash), featureId: ref.slice(slash + 1) };
}

/**
 * The feature a name refers to, written in the pack `packId`: `<packId>/<featureId>` is that feature, and a bare
 * name is the writing pack's own. A bare name with no pack to belong to throws.
 */
export function resolveName(name: string, packId?: string): FeatureRef {
  if (name.includes('/')) {
    if (!splitRef(name)) throw new Error(`"${name}" isn't a feature's ref: a feature is "<packId>/<featureId>"`);
    return name as FeatureRef;
  }
  if (!packId) throw new Error(`"${name}" names no pack's feature: write "<packId>/${name}"`);
  return `${packId}/${name}` as FeatureRef;
}
