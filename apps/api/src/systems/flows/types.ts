export type FlowTypeCodes = 'variable' | 'llm' | 'decision' | 'action' | 'subflow';
export type FlowTypeShortCode = `${FlowTypeCodes}-${number}`;

export type FlowStatus = 'draft' | 'queued' | 'active' | 'inactive';
