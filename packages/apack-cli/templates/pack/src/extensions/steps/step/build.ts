import type { StepBuildFacet, StepCompileResult, StepValidationError } from '@apackdev/sdk/steps';
import { EARS } from '@apackdev/sdk';
import type { DSL__PASCAL__Node } from './types.ts';

export const compile: StepBuildFacet['compile'] = (node, nodeId, ts): StepCompileResult => {
  const step = node as unknown as DSL__PASCAL__Node;
  return {
    entity: { id: nodeId, entityType: EARS.Entity.Node, createdAt: ts, nodeType: '__TYPE__', label: step.label ?? '__LABEL__' },
    relations: [],
  };
};

export const validate: StepBuildFacet['validate'] = (): StepValidationError[] => {
  return [];
};

export const getLabel: StepBuildFacet['getLabel'] = (node, index) => {
  return typeof node.label === 'string' ? node.label : `__LABEL__ ${index}`;
};
