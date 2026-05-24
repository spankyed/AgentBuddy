export type FlowNodeKind = 'action' | 'keepAlive' | 'listener' | 'schedule' | 'llm' | 'flow' | 'switch' | 'fire' | 'kill' | 'entry';

export type FlowPaletteItemState = {
  kind: FlowNodeKind;
  label: string;
};

export type FlowNodeState = {
  id: string;
  kind: FlowNodeKind;
  label: string;
  subtitle?: string;
  exits?: string[];
  x: number;
  y: number;
};

export type FlowEdgeState = {
  dashed?: boolean;
  from: string;
  fromExit?: number;
  to: string;
};

export type FlowCanvasState = {
  breadcrumbs: string[];
  edges: FlowEdgeState[];
  nodes: FlowNodeState[];
  paletteItems: FlowPaletteItemState[];
  selectedNodeId?: string;
};

