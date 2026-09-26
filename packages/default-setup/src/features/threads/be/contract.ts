// The threads system's contract: what it receives, what its own children send it, what it sends its plugin,
// and its context. Its own module, not the feature's types barrel: `#generated/types` star-exports that,
// and one `Contract` per feature would collide there. Codegen reads this without running anything.
import type { IncomingThreadsEvents, OutgoingThreadsEvents, ThreadsContext } from './types.ts';

export type Contract = {
  context: ThreadsContext
  incoming: IncomingThreadsEvents
  outgoing: OutgoingThreadsEvents
}
