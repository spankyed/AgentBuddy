import type { StepBuildFacet, StepNodeFacet, StepCompileResult, StepValidationError } from '@apack/sdk/steps';
import { EARS } from '@apack/sdk';
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

/**
 * What a node of this type starts with. Both processes read it — the backend writes it onto a new node and
 * the canvas draws it — so it lives here, where no Vue or icon import reaches, rather than in `fe.ts`.
 *
 * Fields you add to `defaults` have to satisfy `validate` above: adding the step to a flow creates a node
 * from these and nothing else.
 */
export const __CAMEL__StepNode: StepNodeFacet = {
  label: '__LABEL__',
  defaultLabel: '__LABEL__',
};
