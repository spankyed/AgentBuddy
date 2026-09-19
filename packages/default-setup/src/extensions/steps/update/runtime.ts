import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { createLogger } from '@abuddy/sdk/logger';
import { extractValueByPath } from '@abuddy/sdk/utils';
import { findById, updateEntity, type EARS } from '@/__generated__/ears';
import { assertEntityType, createEntityRow, reportStepError, stepFields } from '../create/runtime';
import type { UpdateNode } from './types';

const brainLogger = createLogger('brain', { debug: true });

type StepActor = { send: (event: { type: 'COMPLETE'; result: unknown } | { type: 'ERROR'; error: unknown }) => void };

/** The target's id: a `$.` path resolved against the execution context, or the literal id */
function resolveTarget(target: string, ctx: ExecutionContext): unknown {
  return target.startsWith('$.') ? extractValueByPath(ctx, target) : target;
}

export async function handler(t: TNodeEntity, node: unknown, ctx: ExecutionContext, actor: unknown) {
  const n = node as UpdateNode;
  const a = actor as StepActor;
  try {
    const resolved = resolveTarget(n.target, ctx);
    if (resolved !== undefined && resolved !== null && resolved !== '' && typeof resolved !== 'string') {
      throw new Error(`Update step "${n.label}": target "${n.target}" resolved to ${JSON.stringify(resolved)}, not an entity id`);
    }
    const id = (resolved || undefined) as EARS.EntityId | undefined;
    const fields = stepFields(t);

    if (id && findById(id)) {
      updateEntity(id, fields);
      brainLogger.debug(`Updated ${id} in node: ${n.label}`, { fields });
      a.send({ type: 'COMPLETE', result: { ...findById(id), updated: true } });
      return;
    }

    const missing = id ? `No entity has id "${id}"` : `Target "${n.target}" resolved to no id`;
    switch (n.onMissing ?? 'fail') {
      case 'ignore':
        brainLogger.debug(`${missing}; update node "${n.label}" ignores it`);
        a.send({ type: 'COMPLETE', result: { updated: false } });
        return;
      case 'create': {
        assertEntityType(n.entityTypeTarget, n.label);
        const row = createEntityRow(n.entityTypeTarget, fields, undefined);
        brainLogger.debug(`${missing}; update node "${n.label}" created ${row.id}`, { row });
        a.send({ type: 'COMPLETE', result: { ...row, updated: false, created: true } });
        return;
      }
      default:
        throw new Error(`Update step "${n.label}": ${missing}`);
    }
  } catch (error) {
    a.send({ type: 'ERROR', error: reportStepError(error, t, n, ctx) });
  }
}
