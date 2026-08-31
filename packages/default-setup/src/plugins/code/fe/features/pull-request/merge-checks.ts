import type { GhPullRequest } from '@app/api'

export type StatusCheck = NonNullable<GhPullRequest['statusCheckRollup']>[number]

export const FAILING_CONCLUSIONS = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'])
export const PENDING_STATUSES = new Set(['QUEUED', 'IN_PROGRESS', 'PENDING'])

export const isFailing = (c: StatusCheck): boolean =>
  (!!c.conclusion && FAILING_CONCLUSIONS.has(c.conclusion)) || c.state === 'FAILURE' || c.state === 'ERROR'

export const isPending = (c: StatusCheck): boolean =>
  (!!c.status && PENDING_STATUSES.has(c.status) && !c.conclusion) || (!c.status && c.state === 'PENDING')
