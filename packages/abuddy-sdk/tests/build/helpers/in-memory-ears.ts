/**
 * Configures the SDK's own EARS engine for tests.
 *
 * The engine is in-memory by default (noop persistence sink), so tests drive
 * the real qx/tx/edgeStore rather than a stand-in — which is what the code
 * under test uses: flow-to-dsl imports qx from ears/index and edgeStore from
 * ears/internals directly. The only thing the host must supply is which
 * strings name entity types; tx() uses that to tell "create a new Flow" from
 * "operate on the entity with this id".
 */
import { initEARSRuntime } from '../../../src/ears/runtime';

export function setupInMemoryEARS(entityTypes: readonly string[]): void {
  const types = new Set(entityTypes);
  initEARSRuntime({ isEntityType: (value: string) => types.has(value) });
}
