import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { FlowEntity, FlowEventEntity, StepEntity } from '../types';
import { entries } from '@/shared/utils';

const sharedFields = ['id', 'stepType', 'createdAt', 'label', 'x', 'y'] as const;
const stepFields = {
  LLM: ['prompt'] as const,
  EVENT_LISTENER: [] as const,
  TRANSFORM: [] as const,
  RESPONSE: [] as const,
  ACTION: [] as const,
  VARIABLE: [] as const,
  FIRE_EVENT: [] as const,
  DECISION: [] as const,
}

const fields = [
  ...sharedFields,
  ...entries(stepFields).map(([_, fields]) => fields).flat()
];

const ROOT_FLOW = EARS.RoleKind.Custom("root_flow");

export const getRootFlow = (): EARS.EntityId | undefined =>
  qx().withRole(ROOT_FLOW).first() ?? undefined;

export const getFlowSteps = (threadId: EARS.EntityId) =>
  qx(threadId)
    .linksPick(
      EARS.RelKind.CONTAINS,
      EARS.Entity.Step,
      fields
    );
