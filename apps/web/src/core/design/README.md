# Design System Guide

A robust, consistent design system for the AgentBuddy application.

## Overview

Our design system provides:
- **Centralized design tokens** for consistent styling
- **Vue composables** for easy usage
- **Type-safe** token access
- **Semantic naming** for better maintainability

## Quick Start

```vue
<template>
  <div :class="layout.stack()">
    <h1 :class="textStyles.heading()">Page Title</h1>
    <p :class="textStyles.body()">Body text content</p>
    <button :class="components.button()">Click me</button>
  </div>
</template>

<script setup>
import { useDesignSystem } from '@/core/design/useDesignSystem';

const { textStyles, layout, components } = useDesignSystem();
</script>
```

## Design Tokens

### Typography Scale
- `text-xs` (12px) - Metadata, labels, captions
- `text-sm` (14px) - Body text, buttons (default)
- `text-base` (16px) - Large body text
- `text-lg` (18px) - Section headers
- `text-xl` (20px) - Page headers

### Color System
```typescript
// Text colors
text.primary    // text-neutral-100 - Main text
text.secondary  // text-neutral-300 - Secondary text
text.muted      // text-neutral-400 - Muted/disabled text
text.disabled   // text-neutral-500 - Disabled state

// Backgrounds
background.primary   // bg-neutral-950 - Main background
background.secondary // bg-neutral-900 - Cards, sections
background.elevated  // bg-neutral-800 - Elevated surfaces
background.hover     // hover:bg-white/[0.03] - Hover state
```

### Spacing System
```typescript
// Padding scale
padding.xs  // p-1
padding.sm  // p-2
padding.md  // p-3
padding.lg  // p-4
padding.xl  // p-5

// Gap scale (for flexbox/grid)
gap.xs  // gap-1
gap.sm  // gap-2
gap.md  // gap-3
gap.lg  // gap-4
gap.xl  // gap-6
```

## Component Patterns

### Buttons
```vue
<!-- Primary button -->
<button :class="components.button('primary')">
  Save Changes
</button>

<!-- Secondary button -->
<button :class="components.button('secondary')">
  Cancel
</button>

<!-- Ghost button -->
<button :class="components.button('ghost')">
  Learn More
</button>
```

### Cards
```vue
<!-- Basic card -->
<div :class="components.card()">
  <h3 :class="textStyles.heading('base')">Card Title</h3>
  <p :class="textStyles.body()">Card content</p>
</div>

<!-- Elevated card -->
<div :class="components.card(true)">
  <!-- Content -->
</div>
```

### Forms
```vue
<div :class="layout.stack('sm')">
  <label :class="textStyles.label()">Email</label>
  <input 
    type="email" 
    :class="components.input()"
    placeholder="Enter your email"
  />
</div>
```

### Badges
```vue
<!-- Status badges -->
<span :class="components.badge('success')">Active</span>
<span :class="components.badge('warning')">Pending</span>
<span :class="components.badge('danger')">Error</span>
<span :class="components.badge('primary')">New</span>
```

## Layout Utilities

### Stack Layout (Vertical)
```vue
<div :class="layout.stack()">           <!-- gap-3 (default) -->
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<div :class="layout.stack('lg')">       <!-- gap-4 -->
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

### Row Layout (Horizontal)
```vue
<div :class="layout.row()">             <!-- gap-3, items-center -->
  <Icon />
  <span>Label</span>
</div>

<div :class="layout.row('sm', 'items-start')">  <!-- gap-2, items-start -->
  <Avatar />
  <div>Content</div>
</div>
```

## Best Practices

### 1. Use Semantic Names
```vue
<!-- Good -->
<h1 :class="textStyles.heading()">Title</h1>
<p :class="textStyles.muted()">Helper text</p>

<!-- Avoid -->
<h1 class="text-xl font-semibold text-neutral-100">Title</h1>
<p class="text-sm text-neutral-400">Helper text</p>
```

### 2. Compose Styles
```vue
<script setup>
const { components, interactive } = useDesignSystem();

// Compose multiple utilities
const cardButtonClass = computed(() => 
  `${components.card()} ${interactive.clickable}`
);
</script>
```

### 3. Create Component Variants
```vue
<script setup>
const { components, colors } = useDesignSystem();

const alertClass = (type: 'info' | 'warning' | 'error') => {
  const variants = {
    info: colors.brand.accent,
    warning: 'bg-amber-500/10 text-amber-400',
    error: 'bg-red-500/10 text-red-400',
  };
  
  return `${components.card()} ${variants[type]}`;
};
</script>
```

### 4. Maintain Consistency
- Always use design tokens instead of arbitrary values
- Follow the established patterns
- Document any new patterns you create

## Migration Guide

To migrate existing components:

1. Replace arbitrary rem values:
   ```vue
   <!-- Before -->
   <span class="text-[0.875rem]">Text</span>
   
   <!-- After -->
   <span :class="textStyles.body()">Text</span>
   ```

2. Replace color classes:
   ```vue
   <!-- Before -->
   <div class="text-neutral-300 bg-neutral-800">
   
   <!-- After -->
   <div :class="`${colors.text.secondary} ${colors.background.elevated}`">
   ```

3. Use layout utilities:
   ```vue
   <!-- Before -->
   <div class="flex items-center gap-3">
   
   <!-- After -->
   <div :class="layout.row()">
   ```

## Extending the System

To add new tokens or patterns:

1. Update `tokens.ts` with new values
2. Add utility functions to `useDesignSystem.ts`
3. Document the new patterns here
4. Update existing components to use the new patterns

## Component Library

Consider creating reusable components that encapsulate these patterns:

```vue
<!-- BaseButton.vue -->
<template>
  <button 
    :class="buttonClass"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<script setup>
import { useDesignSystem } from '@/core/design/useDesignSystem';

const props = defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
}>();

const { components, interactive } = useDesignSystem();

const buttonClass = computed(() => {
  const base = components.button(props.variant || 'primary');
  return props.disabled 
    ? `${base} ${interactive.disabled}`
    : base;
});
</script>
```

This approach ensures consistency while providing flexibility for specific use cases. 