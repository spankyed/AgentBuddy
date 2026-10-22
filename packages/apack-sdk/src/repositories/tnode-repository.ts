// Step executions' records (TNode rows): the SDK declares TNode, and its error reports write here
import { untypedWrite, untypedQx as qx } from '../ears/index.ts';
import type { EARS } from '../types/entities.ts';
import { truncateResult } from '../steps/result-truncator.ts';

/** Writes to step executions' records */
export const tnodeRepository = {
  /** Records a step's result on its TNode, truncated; a TNode that doesn't exist is left alone */
  updateTNodeResult: (tNodeId: EARS.EntityId, result: unknown): void => {
    const tNode = qx.ids(tNodeId).pickOne(['nodeAttributes']);
    if (!tNode) return;
    const attributes = (tNode.nodeAttributes ?? {}) as Record<string, unknown>;
    untypedWrite(tNodeId).set('nodeAttributes', { ...attributes, result: truncateResult(result) });
  },
};
