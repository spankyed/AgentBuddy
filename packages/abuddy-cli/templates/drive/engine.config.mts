import { defineEngineConfig } from '@abuddy/testing/playwright';

// Written by `abuddy drive --serve`. Only the engine's session, named exactly rather than by a glob, so a
// pack's own .mts driving script is not dragged into a serving run.
//
// The settings the session's HTTP handshake depends on are the helper's and cannot be overridden here —
// see `EngineConfigOptions` for which four they are and what breaks when one moves.
export default defineEngineConfig();
