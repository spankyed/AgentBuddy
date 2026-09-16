import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { reportStepRuntimeError } from '@abuddy/sdk/steps';
import { createInspectLogger } from '@abuddy/sdk/logger';
import { isEntityType } from '@abuddy/sdk/ears';
import { EARS, createEntityWithDefaults } from '@/__generated__/ears';
import type { CreateNode } from './types';

const { inspect: brainInspect } = createInspectLogger('brain');

type StepActor = { send: (event: { type: 'COMPLETE'; result: unknown } | { type: 'ERROR'; error: unknown }) => void };

/** Fields a label is inferred from, in order */
const LABEL_SOURCES = ['title', 'name', 'topic'] as const;

/** The step's fields: its literal params with its resolved mappings over them, without undefined values */
export function stepFields(tNode: TNodeEntity): Record<string, unknown> {
  return Object.fromEntries(Object.entries(tNode.resolvedParams ?? {}).filter(([, value]) => value !== undefined));
}

/** Throws naming the entity type when the running app hasn't registered it (the SDK's and every registered pack's count) */
export function assertEntityType(entityType: unknown, nodeLabel: string): asserts entityType is string {
  if (typeof entityType !== 'string' || !isEntityType(entityType)) {
    throw new Error(`Step "${nodeLabel}" names entity type "${String(entityType)}", which isn't a registered entity type`);
  }
}

/** Creates an entity of `entityType` with `fields`, labelled from its title, name or topic unless `inferLabel` is false */
export function createEntityRow(entityType: string, fields: Record<string, unknown>, inferLabel: boolean | undefined) {
  const data = { ...fields };
  if (inferLabel !== false && data.label === undefined) {
    const source = LABEL_SOURCES.map((field) => data[field]).find((value) => typeof value === 'string' && value.trim() !== '');
    if (source !== undefined) data.label = source;
  }
  return createEntityWithDefaults(entityType, data);
}

export function reportError(error: unknown, t: TNodeEntity, n: CreateNode | { id: string; label: string; nodeType: string }, ctx: ExecutionContext) {
  return reportStepRuntimeError({
    error,
    source: `brain-${n.nodeType}`,
    phase: `${n.nodeType}.execute`,
    flowTNodeId: ctx.flowTNodeId,
    tNodeId: t.id,
    nodeId: n.id as EARS.EntityId,
    nodeLabel: n.label,
    nodeType: n.nodeType,
    eventType: ctx.event?.type,
  });
}

export async function handler(t: TNodeEntity, node: unknown, ctx: ExecutionContext, actor: unknown) {
  const n = node as CreateNode;
  const a = actor as StepActor;
  try {
    assertEntityType(n.entityTypeTarget, n.label);
    const row = createEntityRow(n.entityTypeTarget, stepFields(t), n.inferLabel);
    brainInspect(`Created ${n.entityTypeTarget} ${row.id} in node: ${n.label}`, { row });
    a.send({ type: 'COMPLETE', result: row });
  } catch (error) {
    a.send({ type: 'ERROR', error: reportError(error, t, n, ctx) });
  }
}
