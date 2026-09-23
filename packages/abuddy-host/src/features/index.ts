// The pack `host`: what the app registers as its own features, and the systems each runs. The API composes its
// registration from here in one import, rather than from the runtime folders the halves used to live in.
export { hostRegistration, PACKS_PLUGIN_EVENT_TYPES, type OutgoingPacksEvents } from './registration.ts';
export { APPLICATION_SYSTEM_EVENTS, createApplicationSystem, pluginVisibility } from './application/be/system.ts';
export { createPacksSystem, packsEvents, packsSpec } from './packs/be/system.ts';
export { createSettingsSystem, settingsEvents, settingsSpec, SETTINGS_PLUGIN_EVENT_TYPES, type OutgoingSettingsEvents } from './settings/be/system.ts';
