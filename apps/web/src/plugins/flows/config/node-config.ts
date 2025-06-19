import { 
  Workflow, 
  Radio, 
  Zap, 
  Play, 
  Plus, 
  RefreshCw, 
  Search, 
  Split, 
  Shuffle, 
  Activity,
  Brain
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { NodeKind } from '@abuddy/api'

export interface NodeConfig {
  type: NodeKind
  label: string
  icon: Component
  color: string
  bgColor: string
  hoverBgColor: string
  connectionRules: {
    inputs: number
    outputs: number
  }
  component?: string // Vue component name for the canvas
}

// Complete node configuration mapping
// Using partial record to handle all possible NodeKind values
export const nodeConfigs: Partial<Record<NodeKind, NodeConfig>> = {
  flow: {
    type: 'flow',
    label: 'Flow',
    icon: Workflow,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    hoverBgColor: 'group-hover:bg-purple-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode'
  },
  listen: {
    type: 'listen',
    label: 'Listen',
    icon: Radio,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    hoverBgColor: 'group-hover:bg-blue-500/15',
    connectionRules: { inputs: 0, outputs: -1 }, // -1 means unlimited
    component: 'ListenNode'
  },
  fire: {
    type: 'fire',
    label: 'Fire',
    icon: Zap,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    hoverBgColor: 'group-hover:bg-amber-500/15',
    connectionRules: { inputs: 1, outputs: 0 },
    component: 'FireNode'
  },
  action: {
    type: 'action',
    label: 'Action',
    icon: Play,
    color: 'text-neutral-400',
    bgColor: 'bg-neutral-500/10',
    hoverBgColor: 'group-hover:bg-neutral-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'ActionNode'
  },
  create: {
    type: 'create',
    label: 'Create',
    icon: Plus,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    hoverBgColor: 'group-hover:bg-purple-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode'
  },
  update: {
    type: 'update',
    label: 'Update',
    icon: RefreshCw,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    hoverBgColor: 'group-hover:bg-purple-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode'
  },
  query: {
    type: 'query',
    label: 'Query',
    icon: Search,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    hoverBgColor: 'group-hover:bg-cyan-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode'
  },
  decision: {
    type: 'decision',
    label: 'Decision',
    icon: Split,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    hoverBgColor: 'group-hover:bg-orange-500/15',
    connectionRules: { inputs: 1, outputs: -1 },
    component: 'DecisionNode'
  },
  transform: {
    type: 'transform',
    label: 'Transform',
    icon: Shuffle,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    hoverBgColor: 'group-hover:bg-emerald-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode'
  },
  keep_alive: {
    type: 'keep_alive',
    label: 'Keep Alive',
    icon: Activity,
    color: 'text-neutral-400',
    bgColor: 'bg-neutral-500/10',
    hoverBgColor: 'group-hover:bg-neutral-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode'
  },
  llm: {
    type: 'llm',
    label: 'LLM',
    icon: Brain,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    hoverBgColor: 'group-hover:bg-indigo-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode'
  }
} as const

// Canvas-specific styling for node types
export const getNodeCanvasClasses = (nodeType: NodeKind | string, stepNodeType?: string): string => {
  const base = 'px-4 py-2 rounded-md border relative transition-all'
  const type = (stepNodeType || nodeType) as string
  
  switch (type) {
    case 'flow':
      return `${base} bg-purple-500/20 border-purple-500/50 text-purple-200`
    case 'listen':
      return `${base} bg-blue-500/20 border-blue-500/50 text-blue-200`
    case 'fire':
      return `${base} bg-amber-500/20 border-amber-500/50 text-amber-200`
    case 'query':
      return `${base} bg-cyan-500/20 border-cyan-500/50 text-cyan-200`
    case 'create':
    case 'update':
      return `${base} bg-purple-500/20 border-purple-500/50 text-purple-200`
    case 'decision':
      return `${base} bg-orange-500/20 border-orange-500/50 text-orange-200`
    case 'transform':
      return `${base} bg-emerald-500/20 border-emerald-500/50 text-emerald-200`
    case 'llm':
      return `${base} bg-indigo-500/20 border-indigo-500/50 text-indigo-200`
    default:
      return `${base} bg-neutral-700 border-neutral-600 text-neutral-300`
  }
}

// Helper to get icon background for dots/circles
export const getNodeIconDotClasses = (nodeType: NodeKind | string, stepNodeType?: string): string => {
  const type = (stepNodeType || nodeType) as string
  
  switch (type) {
    case 'flow':
      return 'bg-purple-500'
    case 'listen':
      return 'bg-blue-500'
    case 'fire':
      return 'bg-amber-500'
    case 'query':
      return 'bg-cyan-500'
    case 'create':
    case 'update':
      return 'bg-purple-500'
    case 'decision':
      return 'bg-orange-500'
    case 'transform':
      return 'bg-emerald-500'
    case 'llm':
      return 'bg-indigo-500'
    default:
      return 'bg-neutral-500'
  }
}

// Export helper functions for easy access
export const getNodeConfig = (nodeType: NodeKind | string): NodeConfig | undefined => {
  return nodeConfigs[nodeType as NodeKind]
}

export const getAllNodeTypes = (): NodeKind[] => {
  return Object.keys(nodeConfigs) as NodeKind[]
}

export const getPaletteItems = () => {
  return Object.values(nodeConfigs).filter(Boolean).map(config => ({
    type: config!.type,
    label: config!.label,
    icon: config!.icon
  }))
} 