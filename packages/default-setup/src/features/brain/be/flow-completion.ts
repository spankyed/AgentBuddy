import { stepRegistry } from '@abuddy/sdk/steps';

export type TriggerDescriptor = {
  triggerType: string;
  /**
   * Carried by real trigger nodes but deliberately ignored here — persistence
   * is decided by the step's trigger facet alone. Declared so callers (and the
   * tests that pin this behaviour) can pass a whole node.
   */
  scope?: string;
  eventType?: string;
};

type FlowCompletionContext = {
  final: boolean;
  allTracksDrained: boolean;
  hasPersistentTriggers: boolean;
};

export function isPersistentTriggerFlow(triggerNodes: TriggerDescriptor[]): boolean {
  return triggerNodes.some(node => {
    const triggerFacet = stepRegistry.getTrigger(node.triggerType);
    return triggerFacet?.persistent === true;
  });
}

export function shouldCompleteFlow({
  final,
  allTracksDrained,
  hasPersistentTriggers,
}: FlowCompletionContext): boolean {
  return final || (!hasPersistentTriggers && allTracksDrained);
}
