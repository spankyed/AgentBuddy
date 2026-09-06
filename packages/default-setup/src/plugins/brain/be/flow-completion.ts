import { stepRegistry } from '@abuddy/sdk/steps';

export type TriggerDescriptor = {
  triggerType: string;
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
