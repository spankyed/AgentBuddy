import type { ExecutionContext, StepInput } from '@apackdev/sdk/steps';
import { reportError, createLogger } from '@apackdev/sdk/logger';
import { isEntityType } from '@apackdev/sdk/ears';
import { EARS, create } from '#generated/ears.ts';
import type { CreateNode } from './types.ts';

const brainLogger = createLogger('brain', { debug: true });

type StepActor = { send: (event: { type: 'COMPLETE'; result: unknown } | { type: 'ERROR'; error: unknown }) => void };

/** Fields a label is inferred from, in order */
const LABEL_SOURCES = ['title', 'name', 'topic'] as const;

/** The step's fields: its literal params with its resolved mappings over them, without undefined values */
export function stepFields(input: StepInput): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input.params).filter(([, value]) => value !== undefined));
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
  // `create` numbers a short code the type declares
  return create(entityType, data).row();
}

/** Reports a create or update step's error against its run node */
export function reportStepError(error: unknown, input: StepInput, n: CreateNode | { id: string; label: string; nodeType: string }, ctx: ExecutionContext) {
  return reportError({
    error,
    source: `brain-${n.nodeType}`,
    step: {
      phase: `${n.nodeType}.execute`,
      flowRunNodeId: ctx.flowRunNodeId,
      runNodeId: input.runNodeId,
      nodeId: n.id as EARS.EntityId,
      nodeLabel: n.label,
      nodeType: n.nodeType,
      eventType: ctx.event?.type,
    },
  });
}

export async function handler(input: StepInput, node: unknown, ctx: ExecutionContext, actor: unknown) {
  const n = node as CreateNode;
  const a = actor as StepActor;
  try {
    assertEntityType(n.entityTypeTarget, n.label);
    const row = createEntityRow(n.entityTypeTarget, stepFields(input), n.inferLabel);
    brainLogger.debug(`Created ${n.entityTypeTarget} ${row.id} in node: ${n.label}`, { row });
    a.send({ type: 'COMPLETE', result: row });
  } catch (error) {
    a.send({ type: 'ERROR', error: reportStepError(error, input, n, ctx) });
  }
}
