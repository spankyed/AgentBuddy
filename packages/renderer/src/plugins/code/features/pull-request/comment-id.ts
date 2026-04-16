import type { GhPRComment } from '@app/api'

/**
 * Extract the numeric GitHub "database id" from an issue comment by parsing its URL.
 * Optimistic placeholder comments have URLs like `pending-${n}` and return null.
 */
export function getCommentDatabaseId(comment: GhPRComment): number | null {
  const match = comment.url.match(/issuecomment-(\d+)/)
  return match ? parseInt(match[1]) : null
}
