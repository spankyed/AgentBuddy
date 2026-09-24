// The brain system's contract: what it receives, what its own children send it, what it sends its plugin,
// and its context. Its own module, not the feature's types barrel: `#generated/types` star-exports that,
// and one `Contract` per feature would collide there. Codegen reads this without running anything.
import type { BrainContext, IncomingBrainEvents, OutgoingBrainEvents } from './types';

export type Contract = {
  context: BrainContext
  incoming: IncomingBrainEvents
  outgoing: OutgoingBrainEvents
}
