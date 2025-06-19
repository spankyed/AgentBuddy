/**
 * Vue Composable for Design System
 * Provides easy access to design tokens and utility functions
 */

import { computed } from 'vue';
import { designTokens, componentStyles } from './tokens';

export function useDesignSystem() {
  // Text style builders
  const textStyles = {
    heading: (size: keyof typeof designTokens.typography.fontSize = 'xl') => 
      `${designTokens.typography.fontSize[size]} ${designTokens.typography.fontWeight.semibold} ${designTokens.colors.text.primary}`,
    
    body: (size: keyof typeof designTokens.typography.fontSize = 'sm') =>
      `${designTokens.typography.fontSize[size]} ${designTokens.colors.text.primary}`,
    
    muted: (size: keyof typeof designTokens.typography.fontSize = 'sm') =>
      `${designTokens.typography.fontSize[size]} ${designTokens.colors.text.muted}`,
    
    label: (variant: 'primary' | 'secondary' | 'uppercase' = 'primary') =>
      componentStyles.label[variant],
  };

  // Layout utilities
  const layout = {
    stack: (gap: keyof typeof designTokens.spacing.gap = 'md') =>
      `flex flex-col ${designTokens.spacing.gap[gap]}`,
    
    row: (gap: keyof typeof designTokens.spacing.gap = 'md', align = 'items-center') =>
      `flex ${align} ${designTokens.spacing.gap[gap]}`,
    
    container: (padding: keyof typeof designTokens.spacing.padding = 'md') =>
      `${designTokens.spacing.padding[padding]}`,
  };

  // Interactive states
  const interactive = {
    clickable: `cursor-pointer ${designTokens.transitions.base} ${designTokens.colors.background.hover}`,
    
    disabled: `opacity-50 cursor-not-allowed`,
    
    focusRing: `focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:ring-offset-2 focus:ring-offset-neutral-900`,
  };

  // Component builders
  const components = {
    button: (variant: keyof typeof componentStyles.button = 'primary') => 
      `${componentStyles.button.base} ${componentStyles.button[variant]}`,
    
    card: (elevated = false) =>
      `${componentStyles.card.base} ${elevated ? componentStyles.card.elevated : ''}`,
    
    input: () =>
      `${componentStyles.input.base} ${componentStyles.input.focus}`,
    
    badge: (color = 'neutral') => {
      const colors = {
        neutral: 'bg-neutral-700/50 text-neutral-300',
        primary: 'bg-primary-600/20 text-primary-400',
        success: 'bg-emerald-600/20 text-emerald-400',
        warning: 'bg-amber-600/20 text-amber-400',
        danger: 'bg-red-600/20 text-red-400',
      };
      return `inline-flex items-center px-2 py-0.5 ${designTokens.typography.fontSize.xs} ${designTokens.borderRadius.sm} ${colors[color as keyof typeof colors] || colors.neutral}`;
    },
  };

  // Color utilities
  const colors = {
    text: designTokens.colors.text,
    background: designTokens.colors.background,
    border: designTokens.colors.border,
    brand: designTokens.colors.brand,
  };

  // Spacing utilities
  const spacing = {
    padding: designTokens.spacing.padding,
    gap: designTokens.spacing.gap,
  };

  return {
    // Direct access to tokens
    tokens: designTokens,
    
    // Utility functions
    textStyles,
    layout,
    interactive,
    components,
    
    // Quick access
    colors,
    spacing,
    
    // Computed classes
    classes: computed(() => ({
      pageHeader: textStyles.heading('xl'),
      sectionHeader: textStyles.heading('lg'),
      cardTitle: textStyles.heading('base'),
      bodyText: textStyles.body('sm'),
      caption: textStyles.muted('xs'),
      primaryButton: components.button('primary'),
      secondaryButton: components.button('secondary'),
      ghostButton: components.button('ghost'),
    })),
  };
}

// Type exports
export type TextStyles = ReturnType<typeof useDesignSystem>['textStyles'];
export type LayoutUtils = ReturnType<typeof useDesignSystem>['layout'];
export type ComponentBuilders = ReturnType<typeof useDesignSystem>['components']; 