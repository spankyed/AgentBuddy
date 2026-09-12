import type { StepDefinition, StepValidationError } from '@abuddy/sdk/steps';

export const delayStep: StepDefinition = {
  type: 'delay',
  build: {
    compile(node, nodeId, ts) {
      return {
        entity: {
          id: nodeId,
          entityType: 'Node',
          createdAt: ts,
          nodeType: 'delay',
          label: (node.label as string) || `Delay ${node.duration}s`,
          description: node.description,
          duration: node.duration,
          final: node.final,
        },
        relations: [],
      };
    },
    validate(step, path) {
      const errors: StepValidationError[] = [];
      if (step.duration === undefined || typeof step.duration !== 'number') {
        errors.push({ path, message: 'Delay step must have a numeric "duration" (seconds)' });
      } else if (step.duration <= 0) {
        errors.push({ path: `${path}.duration`, message: '"duration" must be greater than 0' });
      }
      return errors;
    },
    getLabel(step, index) {
      if (typeof step.label === 'string') return step.label;
      return typeof step.duration === 'number' ? `Delay ${step.duration}s` : `Delay ${index}`;
    },
  },
};
