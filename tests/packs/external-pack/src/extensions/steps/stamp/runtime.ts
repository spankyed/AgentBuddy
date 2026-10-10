import type { TNodeEntity, ExecutionContext } from '@abuddy/sdk/steps';

/** Loaded on the step's first run, which is what the generated lazy import in the pack entry is for */
export function handler(tNode: TNodeEntity, node: unknown, ctx: ExecutionContext, actor: unknown): void {
  (actor as { send: (event: unknown) => void }).send({ type: 'COMPLETE', result: { note: (node as { note?: string }).note } });
}
