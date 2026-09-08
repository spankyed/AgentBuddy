// @generated from abuddy.json — do not edit by hand
// Regenerate: node scripts/generate-entries.js

import type { featureServices } from './services';

type FeatureServices = typeof featureServices;

declare module '@abuddy/sdk/types' {
  interface ServiceRegistry extends FeatureServices {}
}

export {};
