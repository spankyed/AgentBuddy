import type { GitStatusFile } from '@/features/code/fe/features/commit/state'

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  status?: GitStatusFile['status']
  children?: TreeNode[]
  fileCount?: number
}
