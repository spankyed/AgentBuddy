/**
 * A pack's feature is `<packId>/<featureId>`, one spelling everywhere: in code, on the bus, in storage, in logs
 * and in actions. A feature contributes at most one system and one plugin, and both run under it. The app is a
 * pack too, `host` (`host/application`, `host/bus`), so there is no namespace of bare ids. Neither a pack id
 * (`PACK_ID_PATTERN`) nor a feature id (`FEATURE_ID_PATTERN`) holds a `/`: a ref splits one way, and no pack can
 * produce one in another pack's namespace.
 *
 * Code names its own features by feature id and every other feature by ref; resolving a name only makes a
 * relative name absolute.
 */
declare const featureRef: unique symbol;

/** A pack's id: a lowercase letter, then lowercase letters, digits and hyphens */
export const PACK_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/** A feature's id, which becomes an identifier in generated code: a lowercase letter, then letters and digits */
export const FEATURE_ID_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/**
 * A feature's ref, `<packId>/<featureId>`. Branded, so a name code wrote can't be passed where a resolved ref
 * belongs: one is made only by `resolveName`.
 */
export type FeatureRef = `${string}/${string}` & { readonly [featureRef]: true };

/** The pack and feature a ref names, or undefined for a string that isn't one (a bare name, or a malformed id) */
export function splitRef(ref: string): { packId: string; featureId: string } | undefined {
  const slash = ref.indexOf('/');
  const packId = ref.slice(0, slash);
  const featureId = ref.slice(slash + 1);
  if (slash < 0 || !PACK_ID_PATTERN.test(packId) || !FEATURE_ID_PATTERN.test(featureId)) return undefined;
  return { packId, featureId };
}

/**
 * The feature a name refers to, written in the pack `packId`: `<packId>/<featureId>` is that feature, and a bare
 * name is the writing pack's own. A bare name with no pack to belong to throws.
 */
export function resolveName(name: string, packId?: string): FeatureRef {
  if (!name.includes('/') && !packId) throw new Error(`"${name}" names no pack's feature: write "<packId>/${name}"`);
  const ref = name.includes('/') ? name : `${packId}/${name}`;
  if (!splitRef(ref)) {
    throw new Error(`"${ref}" isn't a feature's ref: a feature is "<packId>/<featureId>", a pack id lowercase letters, digits and hyphens, and a feature id letters and digits`);
  }
  return ref as FeatureRef;
}
