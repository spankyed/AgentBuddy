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
  Headset
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
    icon: Headset,
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

// Helper to get icon background for dots/circles with ring support
export const getNodeIconDotClasses = (nodeType: NodeKind | string, options?: { isEvent?: boolean; includeRing?: boolean }): string => {
  const type = options?.isEvent ? 'event' : nodeType
  
  let baseClass = ''
  switch (type) {
    case 'event':
    case 'listen':
      baseClass = 'bg-blue-500'
      break
    case 'flow':
      baseClass = 'bg-purple-500'
      break
    case 'fire':
      baseClass = 'bg-amber-500'
      break
    case 'query':
      baseClass = 'bg-cyan-500'
      break
    case 'create':
    case 'update':
      baseClass = 'bg-purple-500'
      break
    case 'decision':
      baseClass = 'bg-orange-500'
      break
    case 'transform':
      baseClass = 'bg-emerald-500'
      break
    case 'llm':
      baseClass = 'bg-indigo-500'
      break
    default:
      baseClass = 'bg-neutral-500'
  }
  
  if (options?.includeRing) {
    const ringColor = baseClass.replace('bg-', 'ring-')
    return `${baseClass} ${ringColor}/30`
  }
  
  return baseClass
}

// Node styling functions for consistent appearance across components
export const getNodeClasses = (nodeType: NodeKind | string, options?: { isEvent?: boolean }): string => {
  const baseClasses = 'px-3 py-2 rounded-md border backdrop-blur-sm transition-all duration-200'
  
  // Special handling for event nodes (from TNodeGraphNode)
  if (options?.isEvent || nodeType === 'event') {
    return `${baseClasses} bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/20 ring-blue-400`
  }
  
  switch (nodeType) {
    case 'flow':
      return `${baseClasses} bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20 ring-purple-400`
    case 'listen':
      return `${baseClasses} bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/20 ring-blue-400`
    case 'fire':
      return `${baseClasses} bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-500/20 ring-amber-400`
    case 'query':
      return `${baseClasses} bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/20 ring-cyan-400`
    case 'create':
    case 'update':
      return `${baseClasses} bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20 ring-purple-400`
    case 'decision':
      return `${baseClasses} bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-orange-500/30 hover:border-orange-400/50 hover:shadow-lg hover:shadow-orange-500/20 ring-orange-400`
    case 'transform':
      return `${baseClasses} bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/20 ring-emerald-400`
    case 'llm':
      return `${baseClasses} bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 hover:border-indigo-400/50 hover:shadow-lg hover:shadow-indigo-500/20 ring-indigo-400`
    default:
      return `${baseClasses} bg-gradient-to-br from-neutral-700/50 to-neutral-800/30 border-neutral-600 hover:border-neutral-500 hover:shadow-lg hover:shadow-neutral-500/20 ring-neutral-400`
  }
}

// Glow effect classes for hover state
export const getNodeGlowClasses = (nodeType: NodeKind | string, options?: { isEvent?: boolean }): string => {
  if (options?.isEvent || nodeType === 'event') {
    return 'bg-blue-500/20'
  }
  
  switch (nodeType) {
    case 'flow': return 'bg-purple-500/20'
    case 'listen': return 'bg-blue-500/20'
    case 'fire': return 'bg-amber-500/20'
    case 'query': return 'bg-cyan-500/20'
    case 'create':
    case 'update': return 'bg-purple-500/20'
    case 'decision': return 'bg-orange-500/20'
    case 'transform': return 'bg-emerald-500/20'
    case 'llm': return 'bg-indigo-500/20'
    default: return 'bg-neutral-500/20'
  }
}

// Badge classes for node type labels
export const getNodeBadgeClasses = (nodeType: NodeKind | string, options?: { isEvent?: boolean }): string => {
  if (options?.isEvent || nodeType === 'event') {
    return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
  }
  
  switch (nodeType) {
    case 'flow': return 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
    case 'listen': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
    case 'fire': return 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
    case 'query': return 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
    case 'create':
    case 'update': return 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
    case 'decision': return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
    case 'transform': return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
    case 'llm': return 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
    default: return 'bg-neutral-700/50 text-neutral-300 border border-neutral-600'
  }
}

// Status indicator classes
export const getNodeStatusClasses = (status: string, variant: 'simple' | 'detailed' = 'simple') => {
  if (variant === 'simple') {
    // BaseNode style - simple with shadow
    switch (status) {
      case 'active':
        return 'bg-green-400 shadow-green-400/50 shadow-sm'
      case 'paused':
        return 'bg-yellow-400 shadow-yellow-400/50 shadow-sm'
      case 'completed':
        return 'bg-blue-400 shadow-blue-400/50 shadow-sm'
      case 'failed':
        return 'bg-red-400 shadow-red-400/50 shadow-sm'
      default:
        return 'bg-neutral-400'
    }
  } else {
    // TNodeGraphNode style - returns outer and inner classes
    const outer = (() => {
      switch (status) {
        case 'active':
          return 'ring-1 ring-emerald-500/50 shadow-lg shadow-emerald-500/30'
        case 'paused':
          return 'ring-1 ring-amber-500/50 shadow-lg shadow-amber-500/30'
        case 'completed':
          return 'ring-1 ring-blue-500/50 shadow-lg shadow-blue-500/30'
        case 'failed':
          return 'ring-1 ring-red-500/50 shadow-lg shadow-red-500/30'
        default:
          return 'ring-1 ring-neutral-500/50'
      }
    })()
    
    const inner = (() => {
      switch (status) {
        case 'active':
          return 'bg-gradient-to-br from-emerald-400 to-emerald-600'
        case 'paused':
          return 'bg-gradient-to-br from-amber-400 to-amber-600'
        case 'completed':
          return 'bg-gradient-to-br from-blue-400 to-blue-600'
        case 'failed':
          return 'bg-gradient-to-br from-red-400 to-red-600'
        default:
          return 'bg-gradient-to-br from-neutral-400 to-neutral-600'
      }
    })()
    
    return { outer, inner }
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