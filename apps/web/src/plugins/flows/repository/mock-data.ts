import type { NodeEntity } from '@abuddy/api';

// Mock node data for brain plugin visualization
// In production, this would come from the actual flow data
const mockNodes: Record<string, Partial<NodeEntity>> = {
  'Node-1': { id: 'Node-1', label: 'User Message', nodeType: 'listen' },
  'Node-2': { id: 'Node-2', label: 'System Events', nodeType: 'listen' },
  'Node-3': { id: 'Node-3', label: 'Message Type', nodeType: 'decision' },
  'Node-4': { id: 'Node-4', label: 'Create Context', nodeType: 'create' },
  'Node-5': { id: 'Node-5', label: 'Update Context', nodeType: 'update' },
  'Node-6': { id: 'Node-6', label: 'Send Response', nodeType: 'fire' },
  'Node-8': { id: 'Node-8', label: 'Get User Intent', nodeType: 'query' },
  'Node-9': { id: 'Node-9', label: 'Format Response', nodeType: 'transform' },
  'Node-10': { id: 'Node-10', label: 'Log Intent', nodeType: 'fire' },
  'Node-11': { id: 'Node-11', label: 'Command Handler', nodeType: 'flow', flowRef: 'Flow-3' },
};

export const getNodeData = (nodeId: string) => {
  return mockNodes[nodeId];
}; 