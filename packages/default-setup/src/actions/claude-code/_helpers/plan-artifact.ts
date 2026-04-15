/**
 * Plan artifact helper — create a draft plan and resolve it to
 * approved/rejected when the user responds to the plan-approval block.
 *
 * Lifecycle semantics:
 *   - A thread has at most ONE draft plan artifact at a time.
 *   - Once a plan is approved or rejected, any future ExitPlanMode call
 *     creates a fresh artifact so plan history stays legible in the right
 *     panel.
 *   - Previous plans remain as persistent artifacts — we don't delete
 *     rejected/approved ones.
 *
 * All lookups go directly through the in-memory EARS repository — no
 * module-level cache. EARS is LMDB-backed and kept in memory, so the
 * repository query is essentially a Map access.
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
  /** Git branch the plan was created on. */
  branch?: string;
  /** PR number associated with this plan. */
  prNumber?: string;
}

/**
 * Create a new plan artifact in `draft` status containing the given
 * markdown body and notify the frontend.
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
  opts?: { branch?: string; prNumber?: string },
): EntityId {
  const content: PlanArtifactContent = {
    notes: planMarkdown,
    status: 'draft',
    steps: [],
    ...(opts?.branch && { branch: opts.branch }),
    ...(opts?.prNumber && { prNumber: opts.prNumber }),
  };
  const { artifactId } = services.artifact.createAndNotify({
    artifactType: 'plan',
    title,
    content,
    threadId,
  });
  return artifactId as EntityId;
}

/**
 * Flip the most recent draft plan for this thread to `approved` or
 * `rejected`. Reads the current content off the repository so existing
 * fields (notes, steps) are preserved. No-op if there's no draft plan
 * (e.g. ExitPlanMode never fired, or the previous call already resolved
 * it).
 */
export function resolvePlanDraft(
  services: Services,
  threadId: EntityId,
  nextStatus: 'approved' | 'rejected',
): void {
  // Find the most recent plan artifact still in draft status.
  const artifacts = services.repository.chatQueries.threadArtifacts(threadId) as Array<{
    id: EntityId;
    type: string;
    content: unknown;
  }>;
  const draft = artifacts.find(
    a => a.type === 'plan' && (a.content as Partial<PlanArtifactContent>)?.status === 'draft',
  );
  if (!draft) return;

  const prevContent = (draft.content as Partial<PlanArtifactContent>) ?? {};
  const nextContent: PlanArtifactContent = {
    notes: prevContent.notes ?? '',
    steps: prevContent.steps ?? [],
    status: nextStatus,
  };

  services.artifact.updateAndNotify(draft.id, {
    content: nextContent,
    threadId,
  });
}
