import type { StepBuildFacet, StepCompileResult, StepValidationError } from '@apackdev/sdk/steps';
import { EARS } from '#generated/ears.ts';
import type { DSLStampNode } from './types.ts';

export const compile: StepBuildFacet['compile'] = (node, nodeId, ts): StepCompileResult => {
  const step = node as unknown as DSLStampNode;
  return {
    entity: { id: nodeId, entityType: EARS.Entity.Node, createdAt: ts, nodeType: 'stamp', label: step.label ?? 'Stamp', note: step.note },
    relations: [],
  };
};

export const validate: StepBuildFacet['validate'] = (): StepValidationError[] => {
  return [];
};

export const getLabel: StepBuildFacet['getLabel'] = (node, index) => {
  return typeof node.label === 'string' ? node.label : `Stamp ${index}`;
};
