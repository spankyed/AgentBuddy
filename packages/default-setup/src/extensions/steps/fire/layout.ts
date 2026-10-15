import type { StepLayoutDescriptor } from '@apackdev/sdk/steps';

export const getPorts: NonNullable<StepLayoutDescriptor['getPorts']> = (node) => [
  { id: `${node.id}-in`, layoutOptions: { 'port.side': 'WEST' } },
];
