import type { StepBuildFacet, StepNodeFacet, StepCompileResult, StepValidationError } from '@apack/sdk/steps';
import { EARS } from '#generated/ears.ts';
import type { DSLStampNode } from './types.ts';

export const stampStepBuild: StepBuildFacet = {
  compile(node, nodeId, ts): StepCompileResult {
    const step = node as unknown as DSLStampNode;
    return {
      entity: { id: nodeId, entityType: EARS.Entity.Node, createdAt: ts, nodeType: 'stamp', label: step.label ?? 'Stamp', note: step.note },
      relations: [],
    };
  },
  validate(): StepValidationError[] {
    return [];
  },
  getLabel(node, index) {
    return typeof node.label === 'string' ? node.label : `Stamp ${index}`;
  },
};

/**
 * What a node of this type starts with. Declared here rather than in `fe.ts` because the backend reads it
 * too — `createNodeDefaults` runs where the node is created — and `fe.ts` imports Vue and an icon set.
 */
export const stampStepNode: StepNodeFacet = {
  label: 'Stamp',
  defaultLabel: 'Stamp a memo',
  defaults: { note: 'stamped' },
};
