import type { StepBuildFacet, StepCompileResult, StepValidationError } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import type { DSL__PASCAL__Node } from './types.ts';

export const __CAMEL__StepBuild: StepBuildFacet = {
  compile(node, nodeId, ts): StepCompileResult {
    const step = node as unknown as DSL__PASCAL__Node;
    return {
      entity: { id: nodeId, entityType: EARS.Entity.Node, createdAt: ts, nodeType: '__TYPE__', label: step.label ?? '__LABEL__' },
      relations: [],
    };
  },
  validate(): StepValidationError[] {
    return [];
  },
  getLabel(node, index) {
    return typeof node.label === 'string' ? node.label : `__LABEL__ ${index}`;
  },
};
