/**
 * How a pack's feature is addressed at runtime.
 *
 * A feature contributes at most one system and one plugin, and both run under `<packId>.<featureId>`.
 * A manifest's pack id is `^[a-z][a-z0-9-]*$` and its feature ids are letters and digits, so neither
 * may contain a dot: a qualified id parses one way, and no pack can produce an id in another pack's
 * namespace or in the host's, which is the bare ids (`HOST_PLUGIN_IDS`, `bus`).
 *
 * That is why ownership needs no collision check. Registrations name features, and whatever reads one
 * qualifies it here — so "this pack's plugin" is the only thing a pack can say.
 */
export function qualifiedId(packId: string, featureId: string): string {
  return `${packId}.${featureId}`;
}
