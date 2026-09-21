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

/** The address a `<packId>/<featureId>` name refers to; any other name is already an address */
export function addressOf(name: string): string {
  const slash = name.indexOf('/');
  return slash < 0 ? name : qualifiedId(name.slice(0, slash), name.slice(slash + 1));
}
