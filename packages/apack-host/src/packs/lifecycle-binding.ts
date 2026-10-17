import { LIFECYCLE_HOOK_NAMES, type PackLifecycleDeclaration } from '@apackdev/sdk/framework';
import { isPlainObject } from '@apackdev/sdk/utils/pure';
import { sameKeys } from './binding-shape.ts';

/** Check declared hook membership and callable bindings without executing a hook. */
export function lifecycleBindingProblem(declaration: PackLifecycleDeclaration | undefined, actual: unknown): string | undefined {
  const expected = Object.keys(declaration ?? {});
  const hooks = actual === undefined ? {} : actual;
  if (!sameKeys(hooks, expected)) return 'lifecycle';
  if (isPlainObject(hooks)) {
    for (const name of LIFECYCLE_HOOK_NAMES) {
      if (expected.includes(name) && typeof hooks[name] !== 'function') return `lifecycle.${name}`;
    }
  }
}
