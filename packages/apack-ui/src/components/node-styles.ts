import { computed } from 'vue'
import type { Component } from 'vue'
import { Box } from 'lucide-vue-next'
import { getStepDeclarations, getStepDeclaration, getStepBinding, useStepDeclarations } from '@apackdev/sdk/fe'
import type { StepCatalogEntry } from '@apackdev/sdk/framework'

export interface NodeConfig {
  type: string
  label: string
  defaultLabel?: string
  icon: Component
  /** Resolved from the step's `colorKey`, not declared beside it */
  color: string
  colorKey?: string
  connectionRules: {
    inputs: number    // -1 means unlimited
    outputs: number   // -1 means unlimited
  }
  isImplemented?: boolean
  isDisabled?: boolean
}

export interface NodeStyleOptions {
  isEvent?: boolean
  includeRing?: boolean
}

export type NodeStatus = 'active' | 'paused' | 'completed' | 'failed'
export type StatusVariant = 'simple' | 'detailed'

const NODE_STYLE_CLASSES = {
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
  // A node's icon colour, which each step used to spell out beside the token it is a function of. Written
  // out rather than built from the token at runtime: Tailwind finds class names by reading the source, so
  // a `text-${key}-400` would generate no CSS at all.
  iconText: {
    purple: 'text-purple-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    cyan: 'text-cyan-400',
    orange: 'text-orange-400',
    emerald: 'text-emerald-400',
    indigo: 'text-indigo-400',
    neutral: 'text-neutral-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400'
  }
} as const

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

type ColorKey = keyof typeof NODE_STYLE_CLASSES.gradient

/** Declared presentation survives disabled or unavailable implementations. */
function buildNodeConfigs(entries: readonly StepCatalogEntry[]): Record<string, NodeConfig> {
  return Object.fromEntries(entries.flatMap(({ type, declaration }) => {
    if (!declaration.fe) return [];
    const { node, fe } = declaration;
    const ready = getStepBinding(type);
    const colorKey = fe.colorKey && Object.hasOwn(NODE_STYLE_CLASSES.iconText, fe.colorKey) ? fe.colorKey as ColorKey : 'neutral';
    return [[type, {
      ...fe.nodeConfig,
      label: node.label,
      ...(node.defaultLabel !== undefined && { defaultLabel: node.defaultLabel }),
      type,
      icon: (ready?.binding.fe?.nodeConfig.icon as Component | undefined) ?? Box,
      colorKey,
      color: NODE_STYLE_CLASSES.iconText[colorKey],
      isDisabled: fe.nodeConfig.isDisabled === true || !ready,
      ...(declaration.kind === 'trigger' && { connectionRules: { inputs: 0, outputs: -1 } }),
    }]];
  }));
}

function createNodeStyles(getConfigs: () => Record<string, NodeConfig>) {
  const resolveNodeType = (nodeType: string, options?: NodeStyleOptions): string => {
    return options?.isEvent ? 'event' : nodeType
  }

  const getNodeColorKey = (nodeType: string): ColorKey => {
    const key = getNodeConfig(nodeType)?.colorKey ?? (nodeType === 'event' ? 'blue' : 'neutral')
    return Object.hasOwn(NODE_STYLE_CLASSES.gradient, key) ? key as ColorKey : 'neutral'
  }

  const getNodeClasses = (nodeType: string, options?: NodeStyleOptions): string => {
    const baseClasses = 'px-3 py-2 rounded-lg border backdrop-blur-sm transition-all duration-200'
    const effectiveType = resolveNodeType(nodeType, options)
    const colorKey = getNodeColorKey(effectiveType)

    return `${baseClasses} ${NODE_STYLE_CLASSES.gradient[colorKey]}`
  }

  const getNodeDividerClass = (nodeType: string, options?: NodeStyleOptions): string => {
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

  const getNodeIconTextColor = (nodeType: string, options?: NodeStyleOptions): string => {
    const effectiveType = resolveNodeType(nodeType, options)
    const config = getNodeConfig(effectiveType)

    if (effectiveType === 'event') {
      return 'text-blue-400'
    }

    return config?.color || 'text-neutral-400'
  }

  const getNodeStatusClasses = (
    status: NodeStatus | string,
    variant: StatusVariant = 'simple'
  ): string | { outer: string; inner: string } => {
    if (variant === 'simple') {
      return STATUS_STYLE_CLASSES.simple[status as NodeStatus] || STATUS_STYLE_CLASSES.simple.default
    }

    const detailedStatus = STATUS_STYLE_CLASSES.detailed[status as NodeStatus] || STATUS_STYLE_CLASSES.detailed.default
    return detailedStatus
  }


  const getNodeConfig = (nodeType: string): NodeConfig | undefined => {
    const configs = getConfigs()
    return Object.hasOwn(configs, nodeType) ? configs[nodeType] : undefined
  }

  const isTriggerNode = (nodeType: string | undefined): boolean => {
    if (!nodeType) return false
    const config = getNodeConfig(nodeType)
    return config !== undefined && getStepDeclaration(nodeType)?.declaration.kind === 'trigger'
  }

  const getPaletteItems = () => {
    return Object.values(getConfigs())
      .filter((config): config is NodeConfig => Boolean(config) && config.isImplemented === true)
      .map(({ type, label, icon, isImplemented, isDisabled }) => ({ type, label, icon, isImplemented, isDisabled }))
  }

  const getConnectableNodeTypes = () => {
    return getPaletteItems().filter(item => {
      if (!item.isImplemented || item.isDisabled) return false
      const config = getNodeConfig(item.type)
      return config && config.connectionRules.inputs !== 0
    })
  }

  const getPaletteItemClasses = (type: string): string => {
    const baseClasses = 'rounded-md border backdrop-blur-sm transition-all duration-200 cursor-grab active:cursor-grabbing active:scale-[0.98]'
    const colorKey = getNodeColorKey(type)

    return `${baseClasses} ${NODE_STYLE_CLASSES.gradient[colorKey]}`
  }

  const getInspectionItemClasses = (type: string): string => {
    const baseClasses = 'rounded-md border backdrop-blur-sm transition-all duration-200'
    const colorKey = getNodeColorKey(type)

    return `${baseClasses} ${NODE_STYLE_CLASSES.gradient[colorKey]}`
  }

  const getPaletteIconClasses = (type: string): string => {
    const colorKey = getNodeColorKey(type)
    const solidClass = NODE_STYLE_CLASSES.solid[colorKey]
    const ringClass = NODE_STYLE_CLASSES.ring[colorKey]
    const hoverRingClass = colorKey === 'neutral'
      ? 'group-hover:ring-neutral-400/50'
      : `group-hover:ring-${colorKey}-400/50`

    return `${solidClass} ${ringClass} ${hoverRingClass}`
  }

  const getPaletteIconComponentClasses = (type: string): string => {
    const colorKey = getNodeColorKey(type)

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

  const getPaletteGlowClasses = (type: string): string => {
    const colorKey = getNodeColorKey(type)
    return NODE_STYLE_CLASSES.glow[colorKey]
  }

  const getPaletteGradientClasses = (type: string): string => {
    const colorKey = getNodeColorKey(type)

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

  return {
    getNodeConfigs: getConfigs,
    getNodeClasses, getNodeDividerClass, getNodeIconTextColor, getNodeStatusClasses,
    getNodeConfig, isTriggerNode, getPaletteItems, getConnectableNodeTypes,
    getPaletteItemClasses, getInspectionItemClasses, getPaletteIconClasses,
    getPaletteIconComponentClasses, getPaletteGlowClasses, getPaletteGradientClasses,
  }
}

export const {
  getNodeConfigs, getNodeClasses, getNodeDividerClass, getNodeIconTextColor, getNodeStatusClasses,
    getNodeConfig, isTriggerNode, getPaletteItems, getConnectableNodeTypes,
    getPaletteItemClasses, getInspectionItemClasses, getPaletteIconClasses,
    getPaletteIconComponentClasses, getPaletteGlowClasses, getPaletteGradientClasses,
} = createNodeStyles(() => buildNodeConfigs(getStepDeclarations()))

/** Reactive node presentation owned by the calling component's effect scope. */
export function useNodeStyles() {
  const declarations = useStepDeclarations()
  const configs = computed(() => buildNodeConfigs(declarations.value))
  return createNodeStyles(() => configs.value)
}
