export type BrainEvent = {
  id: string;
  label: string;
  eventType: string;
  triggerType?: 'listener' | 'schedule';
  scope?: string;
  cronExpression?: string;
};

export type BrainNodeStatus = 'active' | 'completed' | 'failed' | 'paused' | 'pending';

export type BrainNode = {
  id: string;
  label: string;
  tNodeType: 'flow' | 'step' | 'event';
  stepNodeType?: 'action' | 'listener' | 'schedule' | 'flow' | 'llm' | 'switch' | 'fire' | 'kill';
  eventType?: string;
  status?: BrainNodeStatus;
  startedAt?: string;
  duration?: string;
  nodeAttributes?: Record<string, unknown>;
  output?: Record<string, unknown> | string;
  children?: BrainNode[];
};

export type BrainGraphNode = BrainNode & {
  x: number;
  y: number;
};

export type BrainGraphEdge = {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
};

export type BrainSurfaceState = {
  showLeftPanel: boolean;
  brainIsPaused?: boolean;
  brainIsDead?: boolean;
  flowTNodeId?: string;
  canGoBack?: boolean;
  pulsingEventType?: string;
  possibleEvents: BrainEvent[];
  traceNodes: BrainNode[];
  graphNodes: BrainGraphNode[];
  graphEdges: BrainGraphEdge[];
  selectedNodeId?: string;
};
