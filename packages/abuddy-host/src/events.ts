// The host's own sends: the unbound ones, stamped with `host` as the sender.
//
// The app is the pack `host`, so its messages should say so — a drop or an unroutable send then names who made it
// instead of leaving that to a grep. `createSends` is the same builder a pack's `#generated/events` uses; the host
// binds only `from`, since it addresses features by ref (`HOST.*`) and has no names to resolve.
//
// Not typed per receiving plugin, the way a pack's generated sends are. Two things stand in the way, and neither
// is this module's to settle: `HOST.*` are branded `FeatureRef`s rather than literal names, so they don't match a
// map keyed by name; and `HostPluginEvents` is the host's *published* inbox — what a pack may send it — not what
// its own systems send their views. See docs/plans/host-seams.md.
import { createSends } from '@abuddy/sdk/events';
import { HOST_PACK_ID } from '@abuddy/sdk/ids';

export const { broadcastToPlugin, sendToPlugin, sendToSystem } = createSends({ from: HOST_PACK_ID });
