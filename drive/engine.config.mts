import { defineEngineConfig } from '@abuddy/testing/playwright';

// The repo's own serving config, the same call `abuddy drive --serve` writes into a pack: only the engine's
// session, named exactly, so no driving script is dragged into a serving run. The settings the session's
// HTTP handshake depends on are the helper's and cannot be overridden here — see `EngineConfigOptions`.
export default defineEngineConfig();
