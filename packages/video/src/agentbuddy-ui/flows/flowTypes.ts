export type FlowNodeKind = 'action' | 'keep_alive' | 'listener' | 'schedule' | 'llm' | 'flow' | 'switch' | 'fire' | 'kill' | 'entry';

export type FlowPaletteItemState = {
  disabled?: boolean;
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
  editingNodeId?: string;
  edges: FlowEdgeState[];
  nodes: FlowNodeState[];
  paletteItems: FlowPaletteItemState[];
  selectedNodeId?: string;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};
