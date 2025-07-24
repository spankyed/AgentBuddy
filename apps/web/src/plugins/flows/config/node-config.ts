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
  Sparkle
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { NodeKind } from '@abuddy/api'

// ===========================
// Type Definitions
// ===========================

export interface NodeConfig {
  type: NodeKind
  label: string
  icon: Component
  color: string
  bgColor: string
  hoverBgColor: string
  connectionRules: {
    inputs: number    // -1 means unlimited
    outputs: number   // -1 means unlimited
  }
  component?: string // Vue component name for the canvas
}

export interface NodeStyleOptions {
  isEvent?: boolean
  includeRing?: boolean
}

export type NodeStatus = 'active' | 'paused' | 'completed' | 'failed'
export type StatusVariant = 'simple' | 'detailed'

// ===========================
// Constants & Configuration
// ===========================

// Color scheme classes for each node type (static for Tailwind)
const NODE_STYLE_CLASSES = {
  // Gradient patterns for main node styling
  gradient: {
    purple: 'bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20 ring-purple-400',
    blue: 'bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/20 ring-blue-400',
    amber: 'bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-500/20 ring-amber-400',
    cyan: 'bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/20 ring-cyan-400',
    orange: 'bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-orange-500/30 hover:border-orange-400/50 hover:shadow-lg hover:shadow-orange-500/20 ring-orange-400',
    emerald: 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/20 ring-emerald-400',
    indigo: 'bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 hover:border-indigo-400/50 hover:shadow-lg hover:shadow-indigo-500/20 ring-indigo-400',
    neutral: 'bg-gradient-to-br from-neutral-700/50 to-neutral-800/30 border-neutral-600 hover:border-neutral-500 hover:shadow-lg hover:shadow-neutral-500/20 ring-neutral-400'
  },
  // Solid background colors
  solid: {
    purple: 'bg-purple-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    cyan: 'bg-cyan-500',
    orange: 'bg-orange-500',
    emerald: 'bg-emerald-500',
    indigo: 'bg-indigo-500',
    neutral: 'bg-neutral-500'
  },
  // Glow effects
  glow: {
    purple: 'bg-purple-500/20',
    blue: 'bg-blue-500/20',
    amber: 'bg-amber-500/20',
    cyan: 'bg-cyan-500/20',
    orange: 'bg-orange-500/20',
    emerald: 'bg-emerald-500/20',
    indigo: 'bg-indigo-500/20',
    neutral: 'bg-neutral-500/20'
  },
  // Badge styles
  badge: {
    purple: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    blue: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    amber: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    cyan: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
    orange: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    indigo: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
    neutral: 'bg-neutral-700/50 text-neutral-300 border border-neutral-600'
  },
  // Ring colors for icon dots
  ring: {
    purple: 'ring-purple-500/30',
    blue: 'ring-blue-500/30',
    amber: 'ring-amber-500/30',
    cyan: 'ring-cyan-500/30',
    orange: 'ring-orange-500/30',
    emerald: 'ring-emerald-500/30',
    indigo: 'ring-indigo-500/30',
    neutral: 'ring-neutral-500/30'
  },
  // Canvas styles (legacy)
  canvas: {
    purple: 'bg-purple-500/20 border-purple-500/50 text-purple-200',
    blue: 'bg-blue-500/20 border-blue-500/50 text-blue-200',
    amber: 'bg-amber-500/20 border-amber-500/50 text-amber-200',
    cyan: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200',
    orange: 'bg-orange-500/20 border-orange-500/50 text-orange-200',
    emerald: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200',
    indigo: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200',
    neutral: 'bg-neutral-700 border-neutral-600 text-neutral-300'
  }
} as const

// Status styling classes (static for Tailwind)
const STATUS_STYLE_CLASSES = {
  simple: {
    active: 'bg-green-400 shadow-green-400/50 shadow-sm',
    paused: 'bg-yellow-400 shadow-yellow-400/50 shadow-sm',
    completed: 'bg-blue-400 shadow-blue-400/50 shadow-sm',
    failed: 'bg-red-400 shadow-red-400/50 shadow-sm',
    default: 'bg-neutral-400'
  },
  detailed: {
    active: {
      outer: 'ring-1 ring-emerald-500/50 shadow-lg shadow-emerald-500/30',
      inner: 'bg-gradient-to-br from-emerald-400 to-emerald-600'
    },
    paused: {
      outer: 'ring-1 ring-amber-500/50 shadow-lg shadow-amber-500/30',
      inner: 'bg-gradient-to-br from-amber-400 to-amber-600'
    },
    completed: {
      outer: 'ring-1 ring-blue-500/50 shadow-lg shadow-blue-500/30',
      inner: 'bg-gradient-to-br from-blue-400 to-blue-600'
    },
    failed: {
      outer: 'ring-1 ring-red-500/50 shadow-lg shadow-red-500/30',
      inner: 'bg-gradient-to-br from-red-400 to-red-600'
    },
    default: {
      outer: 'ring-1 ring-neutral-500/50',
      inner: 'bg-gradient-to-br from-neutral-400 to-neutral-600'
    }
  }
} as const

// Color mapping for node types
const NODE_COLOR_MAP: Record<string, keyof typeof NODE_STYLE_CLASSES.gradient> = {
  flow: 'purple',
  listen: 'blue',
  fire: 'amber',
  query: 'cyan',
  create: 'purple',
  update: 'purple',
  decision: 'orange',
  transform: 'emerald',
  llm: 'indigo',
  event: 'blue',
  keep_alive: 'neutral',
  action: 'neutral'
} as const

// Node configuration registry
export const nodeConfigs: Partial<Record<NodeKind, NodeConfig>> = {
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
  listen: {
    type: 'listen',
    label: 'Listen',
    icon: Radio,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    hoverBgColor: 'group-hover:bg-blue-500/15',
    connectionRules: { inputs: 0, outputs: -1 },
    component: 'ListenNode'
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
  llm: {
    type: 'llm',
    label: 'LLM',
    icon: Sparkle,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    hoverBgColor: 'group-hover:bg-indigo-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode'
  },
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
} as const

// ===========================
// Helper Functions
// ===========================

/**
 * Resolves the effective node type considering event override
 */
const resolveNodeType = (nodeType: NodeKind | string, options?: NodeStyleOptions): string => {
  return options?.isEvent ? 'event' : nodeType
}

/**
 * Gets the color key for a node type
 */
const getNodeColorKey = (nodeType: string): keyof typeof NODE_STYLE_CLASSES.gradient => {
  return NODE_COLOR_MAP[nodeType] || 'neutral'
}

// ===========================
// Main Styling Functions
// ===========================

/**
 * Returns complete node styling classes including gradients, borders, and hover effects
 */
export const getNodeClasses = (nodeType: NodeKind | string, options?: NodeStyleOptions): string => {
  const baseClasses = 'px-3 py-2 rounded-md border backdrop-blur-sm transition-all duration-200'
  const effectiveType = resolveNodeType(nodeType, options)
  const colorKey = getNodeColorKey(effectiveType)
  
  return `${baseClasses} ${NODE_STYLE_CLASSES.gradient[colorKey]}`
}

/**
 * Returns glow effect classes for hover state
 */
export const getNodeGlowClasses = (nodeType: NodeKind | string, options?: NodeStyleOptions): string => {
  const effectiveType = resolveNodeType(nodeType, options)
  const colorKey = getNodeColorKey(effectiveType)
  return NODE_STYLE_CLASSES.glow[colorKey]
}

/**
 * Returns badge styling for node type labels
 */
export const getNodeBadgeClasses = (nodeType: NodeKind | string, options?: NodeStyleOptions): string => {
  const effectiveType = resolveNodeType(nodeType, options)
  const colorKey = getNodeColorKey(effectiveType)
  return NODE_STYLE_CLASSES.badge[colorKey]
}

/**
 * Returns icon dot classes with optional ring styling
 */
export const getNodeIconDotClasses = (nodeType: NodeKind | string, options?: NodeStyleOptions): string => {
  const effectiveType = resolveNodeType(nodeType, options)
  const colorKey = getNodeColorKey(effectiveType)
  const baseClass = NODE_STYLE_CLASSES.solid[colorKey]
  
  if (options?.includeRing) {
    const ringClass = NODE_STYLE_CLASSES.ring[colorKey]
    return `${baseClass} ${ringClass}`
  }
  
  return baseClass
}

/**
 * Returns text color classes for node type icons
 */
export const getNodeIconTextColor = (nodeType: NodeKind | string, options?: NodeStyleOptions): string => {
  const effectiveType = resolveNodeType(nodeType, options)
  const config = getNodeConfig(effectiveType)
  
  if (effectiveType === 'event') {
    return 'text-blue-400'
  }
  
  return config?.color || 'text-neutral-400'
}

/**
 * Returns background color classes for node type icons
 */
export const getNodeIconBgColor = (nodeType: NodeKind | string, options?: NodeStyleOptions): string => {
  const effectiveType = resolveNodeType(nodeType, options)
  const config = getNodeConfig(effectiveType)
  
  if (effectiveType === 'event') {
    return 'bg-blue-500/10'
  }
  
  return config?.bgColor || 'bg-neutral-500/10'
}

/**
 * Returns status indicator classes based on variant
 */
export const getNodeStatusClasses = (
  status: NodeStatus | string, 
  variant: StatusVariant = 'simple'
): string | { outer: string; inner: string } => {
  if (variant === 'simple') {
    return STATUS_STYLE_CLASSES.simple[status as NodeStatus] || STATUS_STYLE_CLASSES.simple.default
  }
  
  // Detailed variant returns object with outer and inner classes
  const detailedStatus = STATUS_STYLE_CLASSES.detailed[status as NodeStatus] || STATUS_STYLE_CLASSES.detailed.default
  return detailedStatus
}


// ===========================
// Utility Functions
// ===========================

/**
 * Gets node configuration by type
 */
export const getNodeConfig = (nodeType: NodeKind | string): NodeConfig | undefined => {
  return nodeConfigs[nodeType as NodeKind]
}

/**
 * Returns all configured node types
 */
export const getAllNodeTypes = (): NodeKind[] => {
  return Object.keys(nodeConfigs) as NodeKind[]
}

/**
 * Returns palette items for UI display
 */
export const getPaletteItems = () => {
  return Object.values(nodeConfigs)
    .filter((config): config is NodeConfig => Boolean(config))
    .map(({ type, label, icon }) => ({ type, label, icon }))
}

// ===========================
// Palette Styling Functions
// ===========================

/**
 * Get palette item classes matching our node styles
 */
export const getPaletteItemClasses = (type: string): string => {
  const baseClasses = 'rounded-md border backdrop-blur-sm transition-all duration-200 cursor-grab active:cursor-grabbing active:scale-[0.98]'
  const colorKey = getNodeColorKey(type)
  
  return `${baseClasses} ${NODE_STYLE_CLASSES.gradient[colorKey]}`
}

/**
 * Returns node styling classes for inspection panel (without grab cursor)
 */
export const getInspectionItemClasses = (type: string): string => {
  const baseClasses = 'rounded-md border backdrop-blur-sm transition-all duration-200'
  const colorKey = getNodeColorKey(type)
  
  return `${baseClasses} ${NODE_STYLE_CLASSES.gradient[colorKey]}`
}

/**
 * Get icon dot classes for palette items
 */
export const getPaletteIconClasses = (type: string): string => {
  const colorKey = getNodeColorKey(type)
  const solidClass = NODE_STYLE_CLASSES.solid[colorKey]
  const ringClass = NODE_STYLE_CLASSES.ring[colorKey]
  const hoverRingClass = colorKey === 'neutral' 
    ? 'group-hover:ring-neutral-400/50'
    : `group-hover:ring-${colorKey}-400/50`
  
  return `${solidClass} ${ringClass} ${hoverRingClass}`
}

/**
 * Get icon component classes for palette items
 */
export const getPaletteIconComponentClasses = (type: string): string => {
  const colorKey = getNodeColorKey(type)
  
  // Map color keys to text classes
  const textColorMap: Record<string, string> = {
    purple: 'text-purple-400 group-hover:text-purple-300',
    blue: 'text-blue-400 group-hover:text-blue-300',
    amber: 'text-amber-400 group-hover:text-amber-300',
    cyan: 'text-cyan-400 group-hover:text-cyan-300',
    orange: 'text-orange-400 group-hover:text-orange-300',
    emerald: 'text-emerald-400 group-hover:text-emerald-300',
    indigo: 'text-indigo-400 group-hover:text-indigo-300',
    neutral: 'text-neutral-400 group-hover:text-neutral-300'
  }
  
  return textColorMap[colorKey] || textColorMap.neutral
}

/**
 * Get glow classes for palette items
 */
export const getPaletteGlowClasses = (type: string): string => {
  const colorKey = getNodeColorKey(type)
  return NODE_STYLE_CLASSES.glow[colorKey]
}

/**
 * Get gradient overlay classes for palette items
 */
export const getPaletteGradientClasses = (type: string): string => {
  const colorKey = getNodeColorKey(type)
  
  // Map color keys to gradient classes
  const gradientMap: Record<string, string> = {
    purple: 'from-purple-400 to-purple-600',
    blue: 'from-blue-400 to-blue-600',
    amber: 'from-amber-400 to-amber-600',
    cyan: 'from-cyan-400 to-cyan-600',
    orange: 'from-orange-400 to-orange-600',
    emerald: 'from-emerald-400 to-emerald-600',
    indigo: 'from-indigo-400 to-indigo-600',
    neutral: 'from-neutral-400 to-neutral-600'
  }
  
  return gradientMap[colorKey] || gradientMap.neutral
}