export type TriggerKind = 'listener' | 'schedule';

export type TriggerDescriptor = {
  triggerType: TriggerKind;
  scope?: 'global' | 'local' | 'entry';
};

type FlowCompletionContext = {
  final: boolean;
  allTracksDrained: boolean;
  hasPersistentTriggers: boolean;
};

export function isPersistentTriggerFlow(triggerNodes: TriggerDescriptor[]): boolean {
  return triggerNodes.some(node => node.triggerType === 'schedule');
}

export function shouldCompleteFlow({
  final,
  allTracksDrained,
  hasPersistentTriggers,
}: FlowCompletionContext): boolean {
  return final || (!hasPersistentTriggers && allTracksDrained);
}
