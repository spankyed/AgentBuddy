export interface FileInfo {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: Date
  extension?: string
}

export interface DirectoryContent {
  path: string
  files: FileInfo[]
}

export interface FileContent {
  path: string
  content: string
  encoding: string
}

export interface FileOperation {
  type: 'create' | 'update' | 'delete' | 'rename'
  path: string
  newPath?: string
  content?: string
}

export interface CodeSystemError {
  code: 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INVALID_PATH' | 'IO_ERROR' | 'FILE_TOO_LARGE' | 'SEARCH_ERROR'
  message: string
  path?: string
}

export interface SearchOptions {
  query: string
  path: string
  includePattern?: string
  excludePattern?: string
  caseSensitive?: boolean
  wholeWord?: boolean
  useRegex?: boolean
  maxResults?: number
}

export interface SearchMatch {
  line: number
  column: number
  lineText: string
  matchStart: number
  matchEnd: number
}

export interface SearchResult {
  path: string
  matches: SearchMatch[]
  fileSize?: number
}

export interface SearchProgress {
  filesSearched: number
  totalFiles: number
  currentFile?: string
}