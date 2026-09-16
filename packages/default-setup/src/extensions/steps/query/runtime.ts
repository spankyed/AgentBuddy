import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { reportStepRuntimeError } from '@abuddy/sdk/steps';
import { createInspectLogger } from '@abuddy/sdk/logger';
import { isModelId } from '@abuddy/sdk/models';
import { services } from '@/__generated__/services';
import { executeQuery } from '@/features/database/be/execute/query';
import { DEFAULT_MODEL } from '../llm/model';
import { DEFAULT_RESULT_KEY } from './result-key';
import type { QueryNode } from './types';

const { inspect: brainInspect } = createInspectLogger('brain');

/** The prompt (seeds/prompts/db-query-system.ts) that describes the database and the query API to the model */
const QUERY_SYSTEM_PROMPT = 'DB Query System';

/**
 * The database console's write helpers (`execute/transaction.ts`). The query executor doesn't provide them, so
 * a query calling one fails with "<name> is not defined" before it writes anything.
 */
const WRITE_HELPERS = new Set([
  'tx', 'destroyEntity', 'prepareEntity', 'createEntityWithDefaults', 'updateEntity',
  'createRelation', 'removeRelation', 'removeRelationById', 'grantRole', 'revokeRole',
]);

/** The model's reply without a markdown code fence around it */
function stripCodeFence(text: string): string {
  return text.trim().replace(/^```(?:typescript|ts|javascript|js)?\n?/, '').replace(/\n?```$/, '').trim();
}

export async function handler(t: TNodeEntity, node: unknown, ctx: ExecutionContext, actor: unknown) {
  const n = node as QueryNode;
  const a = actor as { send: (event: { type: string; result?: unknown; error?: unknown }) => void };

  try {
    if (typeof n.prompt !== 'string' || !n.prompt.trim()) {
      throw new Error(`Query step "${n.label}" has no prompt`);
    }
    const model = n.model || DEFAULT_MODEL;
    if (!isModelId(model)) {
      throw new Error(`Query step "${n.label}" names model "${model}": expected provider:model, e.g. ${DEFAULT_MODEL}`);
    }

    const { schema, topology } = services.database.buildQueryContext();
    const instructions = services.prompt.usePrompt(QUERY_SYSTEM_PROMPT, { schema, topology });
    if (!instructions) {
      throw new Error(`Query step "${n.label}" needs the "${QUERY_SYSTEM_PROMPT}" prompt, which isn't in the database`);
    }

    brainInspect(`Generating query for node: ${n.label}`, { model, prompt: n.prompt });

    let reply: string;
    try {
      reply = (await services.inference.generateText({ model, instructions, prompt: n.prompt })).text;
    } catch (error) {
      throw new Error(`Query step "${n.label}" couldn't generate its query with ${model}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const query = stripCodeFence(reply);
    if (!query) {
      throw new Error(`Query step "${n.label}": ${model} returned no query`);
    }

    let rows: unknown;
    try {
      rows = await executeQuery(query);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const missing = /^(\w+) is not defined$/.exec(message)?.[1];
      if (missing && WRITE_HELPERS.has(missing)) {
        throw new Error(`Query step "${n.label}" generated a query that writes (${missing}); query steps only read. Query:\n${query}`);
      }
      throw new Error(`Query step "${n.label}" generated a query that failed: ${message}. Query:\n${query}`);
    }

    brainInspect(`Query completed for node: ${n.label}`, { query });

    a.send({ type: 'COMPLETE', result: { query, [n.resultKey || DEFAULT_RESULT_KEY]: rows } });
  } catch (error) {
    const runtimeError = reportStepRuntimeError({
      error,
      source: 'brain-query',
      phase: 'query.execute',
      flowTNodeId: ctx.flowTNodeId,
      tNodeId: t.id,
      nodeId: n.id,
      nodeLabel: n.label,
      nodeType: n.nodeType,
      eventType: ctx.event?.type,
    });
    a.send({ type: 'ERROR', error: runtimeError });
  }
}
