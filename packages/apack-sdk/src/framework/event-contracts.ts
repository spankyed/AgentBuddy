/** Compiled endpoint metadata; shared SDK lifecycle events are implicit in the protocol. */
export interface FeatureEventContract {
  /** Declared system inputs and outputs; private child events are excluded. */
  system?: { incoming: readonly string[]; outgoing: readonly string[] };
  /** Own-system outputs and declared inbox audiences, excluding shared SDK lifecycle events. */
  plugin?: { receives: readonly string[] };
}

/** Local feature IDs mapped to their compiled transport contracts. */
export type PackEventContracts = Record<string, FeatureEventContract>;

/** @internal Validate endpoint ownership without importing the declaring modules. */
export function _eventContractsProblem(contracts: PackEventContracts | undefined,
  features: Readonly<Record<string, { system?: unknown; plugin?: unknown }>> | undefined,
  native = false): string | undefined {
  for (const [id, contract] of Object.entries(contracts ?? {})) {
    if (!features || !Object.hasOwn(features, id)) return `Event contract belongs to undeclared feature "${id}"`;
    if (!contract.system && !contract.plugin) return `Event contract "${id}" declares no endpoint`;
  }
  if (!native) for (const [id, feature] of Object.entries(features ?? {})) {
    for (const kind of ['system', 'plugin'] as const) {
      const declared = feature[kind] !== undefined;
      const compiled = contracts?.[id]?.[kind] !== undefined;
      if (declared !== compiled) return `${declared ? 'Missing compiled' : 'Undeclared'} event contract for feature "${id}" ${kind}`;
    }
  }
}
