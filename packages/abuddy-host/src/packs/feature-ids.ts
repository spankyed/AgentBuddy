import { FEATURE_ID_PATTERN } from '@abuddy/sdk/ids';

/**
 * Refuses a registration keyed by something other than feature ids. The registries run each feature at
 * `<packId>/<featureId>`, so a key holding a `/` would land in another pack's namespace, and two spellings of one
 * feature would register it twice. The backend and frontend registries both check with this.
 */
export function checkFeatureIds(packId: string, featureIds: Iterable<string>): void {
  for (const featureId of featureIds) {
    if (!FEATURE_ID_PATTERN.test(featureId)) {
      throw new Error(`Pack "${packId}": feature "${featureId}" isn't a feature id; the app runs it at "${packId}/<featureId>"`);
    }
  }
}
