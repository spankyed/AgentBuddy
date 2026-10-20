/** Lifecycle hook names, shared by declarations and checked runtime bindings. */
export const LIFECYCLE_HOOK_NAMES = ['onInit', 'onShutdown'] as const;

/** Pack-root-relative module exports; discovery reads targets without executing them. */
export type PackLifecycleDeclaration = Partial<Record<typeof LIFECYCLE_HOOK_NAMES[number], string>>;
