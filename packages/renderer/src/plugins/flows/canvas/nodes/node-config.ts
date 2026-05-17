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
  Sparkle,
  Plug,
  Clock
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { NodeKind } from '@app/api'

// ===========================
// Type Definitions
// ===========================

export interface NodeConfig {
  type: NodeKind
  label: string
  defaultLabel?: string // Default label for newly created nodes
  icon: Component
  color: string
  bgColor: string
  hoverBgColor: string
  connectionRules: {
    inputs: number    // -1 means unlimited
    outputs: number   // -1 means unlimited
  }
  component?: string // Vue component name for the canvas
  isImplemented?: boolean // Whether the node type is fully implemented
  isDisabled?: boolean // Whether the node type is temporarily disabled (shown in palette but not interactive)
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
  // Subtle colored backgrounds with refined borders
  gradient: {
    purple: 'bg-purple-900/60 border border-purple-400/25 hover:border-purple-400/40 shadow-sm',
    blue: 'bg-blue-900/60 border border-blue-400/25 hover:border-blue-400/40 shadow-sm',
    amber: 'bg-amber-900/60 border border-amber-400/25 hover:border-amber-400/40 shadow-sm',
    cyan: 'bg-cyan-900/60 border border-cyan-400/25 hover:border-cyan-400/40 shadow-sm',
    orange: 'bg-orange-900/60 border border-orange-400/25 hover:border-orange-400/40 shadow-sm',
    emerald: 'bg-emerald-900/60 border border-emerald-400/25 hover:border-emerald-400/40 shadow-sm',
    indigo: 'bg-indigo-900/60 border border-indigo-400/25 hover:border-indigo-400/40 shadow-sm',
    neutral: 'bg-neutral-700/60 border border-neutral-500/30 hover:border-neutral-400/40 shadow-sm',
    red: 'bg-red-900/60 border border-red-400/25 hover:border-red-400/40 shadow-sm',
    yellow: 'bg-yellow-900/60 border border-yellow-400/25 hover:border-yellow-400/40 shadow-sm'
  },
  // Solid accent colors for meaningful indicators
  solid: {
    purple: 'bg-purple-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    cyan: 'bg-cyan-500',
    orange: 'bg-orange-500',
    emerald: 'bg-emerald-500',
    indigo: 'bg-indigo-500',
    neutral: 'bg-neutral-500',
    red: 'bg-red-500',
    yellow: 'bg-yellow-500'
  },
  // Glow effects - much more subtle
  glow: {
    purple: 'bg-purple-500/5',
    blue: 'bg-blue-500/5',
    amber: 'bg-amber-500/5',
    cyan: 'bg-cyan-500/5',
    orange: 'bg-orange-500/5',
    emerald: 'bg-emerald-500/5',
    indigo: 'bg-indigo-500/5',
    neutral: 'bg-neutral-500/5',
    red: 'bg-red-500/5',
    yellow: 'bg-yellow-500/5'
  },
  // Subtle badge styles
  badge: {
    purple: 'bg-neutral-700/40 text-purple-300/80 font-medium',
    blue: 'bg-neutral-700/40 text-blue-300/80 font-medium',
    amber: 'bg-neutral-700/40 text-amber-300/80 font-medium',
    cyan: 'bg-neutral-700/40 text-cyan-300/80 font-medium',
    orange: 'bg-neutral-700/40 text-orange-300/80 font-medium',
    emerald: 'bg-neutral-700/40 text-emerald-300/80 font-medium',
    indigo: 'bg-neutral-700/40 text-indigo-300/80 font-medium',
    neutral: 'bg-neutral-700/40 text-neutral-400 font-medium',
    red: 'bg-neutral-700/40 text-red-300/80 font-medium',
    yellow: 'bg-neutral-700/40 text-yellow-300/80 font-medium'
  },
  // Ring colors for icon dots - very subtle
  ring: {
    purple: 'ring-purple-500/20',
    blue: 'ring-blue-500/20',
    amber: 'ring-amber-500/20',
    cyan: 'ring-cyan-500/20',
    orange: 'ring-orange-500/20',
    emerald: 'ring-emerald-500/20',
    indigo: 'ring-indigo-500/20',
    neutral: 'ring-neutral-600/30',
    red: 'ring-red-500/20',
    yellow: 'ring-yellow-500/20'
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
    neutral: 'bg-neutral-700 border-neutral-600 text-neutral-300',
    red: 'bg-red-500/20 border-red-500/50 text-red-200',
    yellow: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-200'
  }
} as const

// Status styling classes (static for Tailwind)
const STATUS_STYLE_CLASSES = {
  simple: {
    active: 'bg-blue-400 shadow-blue-400/50 shadow-sm',
    paused: 'bg-yellow-400 shadow-yellow-400/50 shadow-sm',
    completed: 'bg-green-500 shadow-green-500/70 shadow-md',
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
  listener: 'blue',
  fire: 'amber',
  query: 'cyan',
  create: 'purple',
  update: 'purple',
  switch: 'yellow',
  transform: 'emerald',
  llm: 'indigo',
  event: 'blue',
  keep_alive: 'emerald',
  kill: 'red',
  action: 'neutral',
  schedule: 'orange'
} as const

// Node configuration registry
export const nodeConfigs: Partial<Record<NodeKind, NodeConfig>> = {
  action: {
    type: 'action',
    label: 'Action',
    defaultLabel: 'Do action',
    icon: Play,
    color: 'text-neutral-400',
    bgColor: 'bg-neutral-700/20',
    hoverBgColor: 'group-hover:bg-neutral-700/30',
    connectionRules: { inputs: -1, outputs: -1 },  // Allow multiple inputs (converging) and outputs (parallel)
    component: 'ActionNode',
    isImplemented: true
  },
  keep_alive: {
    type: 'keep_alive',
    label: 'Keep alive',
    defaultLabel: 'Keep alive',
    icon: Activity,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    hoverBgColor: 'group-hover:bg-emerald-500/15',
    connectionRules: { inputs: 1, outputs: 0 },
    component: 'VariableNode',
    isImplemented: true
  },
  listener: {
    type: 'listener',
    label: 'Listener',
    defaultLabel: 'On event',
    icon: Radio,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    hoverBgColor: 'group-hover:bg-blue-500/15',
    connectionRules: { inputs: 0, outputs: -1 },
    component: 'ListenerNode',
    isImplemented: true
  },
  schedule: {
    type: 'schedule',
    label: 'Schedule',
    defaultLabel: 'On schedule',
    icon: Clock,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    hoverBgColor: 'group-hover:bg-orange-500/15',
    connectionRules: { inputs: 0, outputs: -1 },
    component: 'ListenerNode',
    isImplemented: true
  },
  query: {
    type: 'query',
    label: 'Query',
    defaultLabel: 'Query',
    icon: Search,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    hoverBgColor: 'group-hover:bg-cyan-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode',
    isImplemented: false
  },
  transform: {
    type: 'transform',
    label: 'Transform',
    defaultLabel: 'Transform output',
    icon: Shuffle,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    hoverBgColor: 'group-hover:bg-emerald-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode',
    isImplemented: false
  },
  llm: {
    type: 'llm',
    label: 'LLM',
    defaultLabel: 'Generate text',
    icon: Sparkle,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    hoverBgColor: 'group-hover:bg-indigo-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode',
    isImplemented: true,
    isDisabled: true
  },
  flow: {
    type: 'flow',
    label: 'Flow',
    defaultLabel: 'Handle flow',
    icon: Workflow,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    hoverBgColor: 'group-hover:bg-purple-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode',
    isImplemented: true
  },
  create: {
    type: 'create',
    label: 'Create',
    defaultLabel: 'Create entity',
    icon: Plus,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    hoverBgColor: 'group-hover:bg-purple-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode',
    isImplemented: false
  },
  update: {
    type: 'update',
    label: 'Update',
    defaultLabel: 'Update entity',
    icon: RefreshCw,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    hoverBgColor: 'group-hover:bg-purple-500/15',
    connectionRules: { inputs: 1, outputs: 1 },
    component: 'VariableNode',
    isImplemented: false
  },
  switch: {
    type: 'switch',
    label: 'Switch',
    defaultLabel: 'Choose path',
    icon: Split,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    hoverBgColor: 'group-hover:bg-yellow-500/15',
    connectionRules: { inputs: 1, outputs: -1 },  // Multiple outputs (one per branch)
    component: 'SwitchNode',
    isImplemented: true
  },
  fire: {
    type: 'fire',
    label: 'Fire',
    defaultLabel: 'Fire event',
    icon: Zap,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    hoverBgColor: 'group-hover:bg-amber-500/15',
    connectionRules: { inputs: 1, outputs: 0 },
    component: 'FireNode',
    isImplemented: true
  },
  kill: {
    type: 'kill',
    label: 'Kill',
    defaultLabel: 'Kill flow',
    icon: Plug,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    hoverBgColor: 'group-hover:bg-red-500/15',
    connectionRules: { inputs: 1, outputs: 0 },
    component: 'VariableNode',
    isImplemented: true
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
  const baseClasses = 'px-3 py-2 rounded-lg border backdrop-blur-sm transition-all duration-200'
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
 * Returns accent bar classes for left border
 */
export const getNodeAccentBarClasses = (nodeType: NodeKind | string, options?: NodeStyleOptions): string => {
  const effectiveType = resolveNodeType(nodeType, options)
  const colorKey = getNodeColorKey(effectiveType)

  const accentMap: Record<string, string> = {
    purple: 'bg-purple-400/40',
    blue: 'bg-blue-400/40',
    amber: 'bg-amber-400/40',
    cyan: 'bg-cyan-400/40',
    orange: 'bg-orange-400/40',
    emerald: 'bg-emerald-400/40',
    indigo: 'bg-indigo-400/40',
    neutral: 'bg-neutral-400/40',
    red: 'bg-red-400/40',
    yellow: 'bg-yellow-400/40'
  }

  return accentMap[colorKey] || accentMap.neutral
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
 * Returns divider border class matching node's color scheme
 */
export const getNodeDividerClass = (nodeType: NodeKind | string, options?: NodeStyleOptions): string => {
  const effectiveType = resolveNodeType(nodeType, options)
  const colorKey = getNodeColorKey(effectiveType)

  const dividerMap: Record<string, string> = {
    purple: 'border-purple-500/40',
    blue: 'border-blue-500/40',
    amber: 'border-amber-500/40',
    cyan: 'border-cyan-500/40',
    orange: 'border-orange-500/40',
    emerald: 'border-emerald-500/40',
    indigo: 'border-indigo-500/40',
    neutral: 'border-neutral-500/45',
    red: 'border-red-500/40',
    yellow: 'border-yellow-500/40'
  }

  return dividerMap[colorKey] || dividerMap.neutral
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
    .filter((config): config is NodeConfig => Boolean(config) && config.isImplemented === true)
    .map(({ type, label, icon, isImplemented, isDisabled }) => ({ type, label, icon, isImplemented, isDisabled }))
}

/**
 * Returns node types that can be created as a "next step" connection.
 * Filters to implemented, non-disabled nodes that accept inputs.
 */
export const getConnectableNodeTypes = () => {
  return getPaletteItems().filter(item => {
    if (!item.isImplemented || item.isDisabled) return false
    const config = getNodeConfig(item.type)
    return config && config.connectionRules.inputs !== 0
  })
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

  // Map color keys to text classes - muted and sophisticated
  const textColorMap: Record<string, string> = {
    purple: 'text-purple-300/70 group-hover:text-purple-300/90',
    blue: 'text-blue-300/70 group-hover:text-blue-300/90',
    amber: 'text-amber-300/70 group-hover:text-amber-300/90',
    cyan: 'text-cyan-300/70 group-hover:text-cyan-300/90',
    orange: 'text-orange-300/70 group-hover:text-orange-300/90',
    emerald: 'text-emerald-300/70 group-hover:text-emerald-300/90',
    indigo: 'text-indigo-300/70 group-hover:text-indigo-300/90',
    neutral: 'text-neutral-400 group-hover:text-neutral-300',
    red: 'text-red-300/70 group-hover:text-red-300/90',
    yellow: 'text-yellow-300/70 group-hover:text-yellow-300/90'
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
    neutral: 'from-neutral-400 to-neutral-600',
    red: 'from-red-400 to-red-600',
    yellow: 'from-yellow-400 to-yellow-600'
  }

  return gradientMap[colorKey] || gradientMap.neutral
}
