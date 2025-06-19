/**
 * Design System Tokens
 * Centralized design tokens for consistent styling across the app
 */

export const designTokens = {
  // Typography
  typography: {
    fontSize: {
      xs: 'text-xs',      // 12px - metadata, labels, captions
      sm: 'text-sm',      // 14px - body text, buttons
      base: 'text-base',  // 16px - large body text
      lg: 'text-lg',      // 18px - section headers
      xl: 'text-xl',      // 20px - page headers
      '2xl': 'text-2xl',  // 24px - large headers
    },
    fontWeight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
    lineHeight: {
      none: 'leading-none',
      tight: 'leading-tight',
      normal: 'leading-normal',
      relaxed: 'leading-relaxed',
    }
  },

  // Spacing
  spacing: {
    // Padding
    padding: {
      xs: 'p-1',
      sm: 'p-2',
      md: 'p-3',
      lg: 'p-4',
      xl: 'p-5',
    },
    // Specific padding combinations
    buttonPadding: 'px-3 py-1.5',
    cardPadding: 'px-4 py-3',
    sectionPadding: 'px-6 py-4',
    
    // Gaps
    gap: {
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-3',
      lg: 'gap-4',
      xl: 'gap-6',
    }
  },

  // Colors - semantic naming
  colors: {
    // Text colors
    text: {
      primary: 'text-neutral-100',
      secondary: 'text-neutral-300',
      muted: 'text-neutral-400',
      disabled: 'text-neutral-500',
      inverse: 'text-neutral-900',
    },
    
    // Background colors
    background: {
      primary: 'bg-neutral-950',
      secondary: 'bg-neutral-900',
      elevated: 'bg-neutral-800',
      hover: 'hover:bg-white/[0.03]',
      active: 'bg-white/[0.05]',
    },
    
    // Border colors
    border: {
      default: 'border-neutral-800',
      subtle: 'border-neutral-800/50',
      strong: 'border-neutral-700',
    },
    
    // Brand colors
    brand: {
      primary: 'bg-primary-600 hover:bg-primary-500',
      secondary: 'bg-purple-500/10 hover:bg-purple-500/15',
      accent: 'bg-blue-500/10 hover:bg-blue-500/15',
    }
  },

  // Border radius
  borderRadius: {
    sm: 'rounded',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  },

  // Transitions
  transitions: {
    fast: 'transition-all duration-150',
    base: 'transition-all duration-200',
    slow: 'transition-all duration-300',
  },

  // Shadows
  shadows: {
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    none: 'shadow-none',
  },

  // Z-index scale
  zIndex: {
    base: 'z-0',
    dropdown: 'z-10',
    sticky: 'z-20',
    fixed: 'z-30',
    modalBackdrop: 'z-40',
    modal: 'z-50',
    popover: 'z-60',
    tooltip: 'z-70',
  }
} as const;

// Component-specific combinations
export const componentStyles = {
  button: {
    base: `${designTokens.typography.fontSize.sm} ${designTokens.typography.fontWeight.medium} ${designTokens.spacing.buttonPadding} ${designTokens.borderRadius.md} ${designTokens.transitions.base}`,
    primary: `${designTokens.colors.brand.primary} ${designTokens.colors.text.inverse}`,
    secondary: `${designTokens.colors.background.elevated} ${designTokens.colors.border.default} ${designTokens.colors.text.primary}`,
    ghost: `${designTokens.colors.text.secondary} ${designTokens.colors.background.hover}`,
  },
  
  card: {
    base: `${designTokens.borderRadius.md} ${designTokens.colors.border.subtle} ${designTokens.spacing.cardPadding}`,
    elevated: `${designTokens.colors.background.elevated} ${designTokens.shadows.sm}`,
  },
  
  input: {
    base: `${designTokens.typography.fontSize.sm} ${designTokens.colors.text.primary} ${designTokens.colors.background.secondary} ${designTokens.colors.border.default} ${designTokens.borderRadius.md} ${designTokens.transitions.base}`,
    focus: 'focus:outline-none focus:border-neutral-600',
  },
  
  label: {
    primary: `${designTokens.typography.fontSize.sm} ${designTokens.typography.fontWeight.medium} ${designTokens.colors.text.primary}`,
    secondary: `${designTokens.typography.fontSize.xs} ${designTokens.colors.text.muted}`,
    uppercase: `${designTokens.typography.fontSize.xs} ${designTokens.typography.fontWeight.medium} uppercase tracking-wider ${designTokens.colors.text.disabled}`,
  }
} as const;

// Type exports for TypeScript support
export type DesignTokens = typeof designTokens;
export type ComponentStyles = typeof componentStyles; 