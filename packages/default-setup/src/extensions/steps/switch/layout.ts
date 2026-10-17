import type { StepLayoutDescriptor } from '@apackdev/sdk/steps';

const SWITCH_DIMS = { rowHeight: 26, headerOffset: 43, bottomPadding: 10 };

export const getHeight: NonNullable<StepLayoutDescriptor['getHeight']> = (node) => {
  const branchCount = Array.isArray(node.conditions) ? node.conditions.length : 0;
  return Math.max(50, SWITCH_DIMS.headerOffset + branchCount * SWITCH_DIMS.rowHeight + SWITCH_DIMS.bottomPadding);
};

export const getPorts: NonNullable<StepLayoutDescriptor['getPorts']> = (node) => {
  const branchCount = Array.isArray(node.conditions) ? node.conditions.length : 0;
  const ports: Array<{ id: string; layoutOptions: Record<string, string> }> = [
    { id: `${node.id}-in`, layoutOptions: { 'port.side': 'WEST' } },
  ];
  for (let i = 0; i < branchCount; i++) {
    ports.push({
      id: `${node.id}-out-branch-${i}`,
      layoutOptions: { 'port.side': 'EAST', 'port.index': String(i) },
    });
  }
  return ports;
};
