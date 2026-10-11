// The packs system's contract: what it receives, what its own children send it, what it sends its plugin,
// and its context. Its own module, not the feature's types barrel: `#generated/types` star-exports that,
// and one `Contract` per feature would collide there. Codegen reads this without running anything.
import type { IncomingPacksEvents } from './types.ts';
import type { OutgoingPacksEvents } from '../../registration.ts';

export type Contract = {
  incoming: IncomingPacksEvents
  outgoing: OutgoingPacksEvents
}
