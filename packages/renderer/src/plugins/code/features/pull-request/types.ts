import type { GitStatusFile } from '@/plugins/code/features/commit/state'

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  status?: GitStatusFile['status']
  children?: TreeNode[]
  fileCount?: number
}
