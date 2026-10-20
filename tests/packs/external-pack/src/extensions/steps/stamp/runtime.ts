import type { TNodeEntity, ExecutionContext } from '@apackdev/sdk/steps';
import type { Services } from '#generated/services.ts';

/** Loaded on the step's first run, which is what the generated lazy import in the pack entry is for */
export function handler(tNode: TNodeEntity, node: unknown, ctx: ExecutionContext, actor: unknown): void {
  const services = ctx.runtime.servicesForAction('stamp') as Services;
  services.memoStamp.write((node as { note?: string }).note ?? 'stamped');
  (actor as { send: (event: unknown) => void }).send({ type: 'COMPLETE', result: { note: (node as { note?: string }).note } });
}
