import type { Incoming__PASCAL__Events, Outgoing__PASCAL__Events } from './types.ts';

// This system's contract, which apack.json names at features[].system.contract. Codegen reads it as a declared
// type, without running anything, so it lives here rather than on the spec: a type has no declared-versus-inferred
// gap, and nothing an annotation can widen away.
//
// Add `internal` for what this system's own children send it (a `fromCallback` child telling its parent). Those
// reach the machine's event union and nothing a pack depending on yours can see.
export type Contract = {
  incoming: Incoming__PASCAL__Events;
  outgoing: Outgoing__PASCAL__Events;
};
