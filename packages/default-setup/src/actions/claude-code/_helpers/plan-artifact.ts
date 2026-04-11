/**
 * Plan artifact helper — create a draft plan and resolve it to
 * approved/rejected when the user responds to the plan-approval block.
 *
 * Mirrors the `session-artifact.ts` pattern (per-thread Map cache +
 * thin wrappers over `services.artifact.createAndNotify` /
 * `updateAndNotify`) but with different lifecycle semantics:
 *
 *   - A thread has at most ONE draft plan artifact at a time.
 *   - Once a plan is approved or rejected, the cache slot clears and
 *     any future ExitPlanMode call creates a fresh artifact so plan
 *     history stays legible in the right panel.
 *   - Previous plans remain as persistent artifacts — we don't delete
 *     rejected/approved ones.
 *
 * Shape contract: PlanArtifactContent lives at
 *   packages/api/src/systems/threads/types.ts:375-387
 * — { notes: string, status: PlanStatus, steps: [] }
 *
 * Files without `export const meta` are auto-inlined into the consuming
 * action at compile time (see packages/default-setup/CLAUDE.md), so this
 * helper adds zero runtime dependencies.
 */

import type { Services, EntityId } from '../../../types';

export type PlanStatus =
  | 'draft'
  | 'approved'
  | 'in-progress'
  | 'completed'
  | 'rejected';

export interface PlanArtifactContent {
  notes: string;
  status: PlanStatus;
  steps: Array<{
    id: string;
    title: string;
    description?: string;
    status: string;
  }>;
}

/**
 * Thread → id of the currently-*draft* plan artifact. Cleared on
 * approve/reject so the next ExitPlanMode call creates a fresh one
 * rather than overwriting the prior outcome.
 */
const draftPlanCache = new Map<EntityId, EntityId>();

/**
 * Create a new plan artifact in `draft` status containing the given
 * markdown body, notify the frontend, and cache the id so we can flip
 * its status later via `resolvePlanDraft`.
 *
 * Always creates a fresh artifact — historical plans (approved or
 * rejected) remain in the thread so the user can scroll back and see
 * what Claude proposed at each stage.
 */
export function createPlanDraft(
  services: Services,
  threadId: EntityId,
  planMarkdown: string,
  title = 'Implementation Plan',
): EntityId {
  const content: PlanArtifactContent = {
    notes: planMarkdown,
    status: 'draft',
    steps: [],
  };
  const { artifactId } = services.artifact.createAndNotify({
    artifactType: 'plan',
    title,
    content,
    threadId,
  });
  draftPlanCache.set(threadId, artifactId as EntityId);
  return artifactId as EntityId;
}

/**
 * Flip the cached draft plan for this thread to `approved` or
 * `rejected` and clear the cache slot. Reads the current content off
 * the repository so existing fields (notes, steps) are preserved. No-op
 * if there's no cached draft (e.g. ExitPlanMode never fired, or the
 * previous call already resolved it).
 */
export function resolvePlanDraft(
  services: Services,
  threadId: EntityId,
  nextStatus: 'approved' | 'rejected',
): void {
  const artifactId = draftPlanCache.get(threadId);
  if (!artifactId) return;

  // Read the latest content from the repository so we don't clobber
  // any fields another path may have written to. The EARS query layer
  // is synchronous.
  const current = (
    services.repository.chatQueries.threadArtifacts(threadId) as Array<{
      id: EntityId;
      content: unknown;
    }>
  ).find(a => a.id === artifactId);
  const prevContent = (current?.content as Partial<PlanArtifactContent> | undefined) ?? {};

  const nextContent: PlanArtifactContent = {
    notes: prevContent.notes ?? '',
    steps: prevContent.steps ?? [],
    status: nextStatus,
  };

  services.artifact.updateAndNotify(artifactId, {
    content: nextContent,
    threadId,
  });
  draftPlanCache.delete(threadId);
}
