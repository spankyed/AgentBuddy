/**
 * Service registry augmentation.
 *
 * Maps service names to their concrete types so that
 * `services.llm`, `services.prompt`, etc. get full autocomplete
 * and type checking through the SDK's ServiceRegistry.
 *
 * Import this file (side-effect) to activate the augmentation:
 *   import '@app/default-setup/src/registries/service-types';
 */

import type { featureServices } from './services';

type FeatureServices = typeof featureServices;

declare module '@abuddy/sdk/types' {
  interface ServiceRegistry extends FeatureServices {}
}

export {};
