import { EARS } from '@/core/types'
import type { KeyboardShortcut } from '../settings/types'

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

// Git types
export interface GitStatusFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied' | 'typechange' | 'unmerged'
  staged: boolean
  originalPath?: string // For renames and copies
  score?: number // Rename/copy similarity score (0-100)
}

export interface GitBranch {
  name: string
  current: boolean
}

export interface GitCommitInfo {
  message: string
  author?: string
  date?: Date
}

export interface GitDiff {
  path: string
  diff: string
  staged: boolean
  originalContent?: string
  modifiedContent?: string
}

// File watching types
export interface FileChangeInfo {
  path: string
  modifiedAt: Date
  changeType: 'add' | 'change' | 'unlink'
}

// Terminal types
export interface TerminalInfo {
  id: EARS.EntityId
  title: string
  customTitle?: string // User-defined custom name, takes precedence over default
  pid: number
  shell?: string
  cwd: string
  active: boolean
  cols: number
  rows: number
}

export interface TerminalOutput {
  terminalId: EARS.EntityId
  data: string
}

export interface TerminalInput {
  terminalId: EARS.EntityId
  data: string
}

export interface TerminalResize {
  terminalId: EARS.EntityId
  cols: number
  rows: number
}

export interface TerminalCreate {
  id?: EARS.EntityId
  title?: string
  cwd?: string
  shell?: string
  cols?: number
  rows?: number
}

export interface TerminalClose {
  terminalId: string
}

// Quick Open types
export interface QuickOpenOptions {
  query: string
  baseDirectory: string
  excludePatterns?: string[]
  maxResults?: number
}

export interface QuickOpenResult {
  path: string
  relativePath: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  score?: number
}

// Settings types
export interface CodeSettings {
  hotkeys: {
    openTerminal?: KeyboardShortcut | null;
    navigatePrevPanel?: KeyboardShortcut | null;
    navigateNextPanel?: KeyboardShortcut | null;
    [key: string]: KeyboardShortcut | null | undefined;
  };
  restoreTerminals?: boolean;
  defaultBaseDirectory?: string | null;
  enableShellIntegration?: boolean;
  confirmTerminalClose?: boolean;
  closeTerminalOnTabClose?: boolean;
}

export type CodeConnectedData = {
  baseDirectory: string | null;
  activeDirectory: string | null;
  settings?: CodeSettings;
};