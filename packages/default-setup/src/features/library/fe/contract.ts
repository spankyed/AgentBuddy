// The library plugin's contract: the state it publishes and what other plugins may send it.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears` — which is what lets
// codegen read the contract without resolving the machine, whose imports cycle back through `#generated/events`.
// `abuddy.json` names it at `features[].plugin.contract`.
import type { NavHistory, PluginInbox } from '@abuddy/sdk/fe'
import type { BreadcrumbItem, DocumentDTO, LibraryIndex, LibraryItem, SearchIndex } from '@/__generated__/types'

export interface LibraryContext {
  // Core view state
  currentView: 'browser' | 'create' | 'edit' | 'create-index' | 'edit-index' | 'test-index'
  editingDocument?: DocumentDTO

  // File browser fields
  items: LibraryItem[]
  currentFolderId: string | null
  currentPath: string[]
  selectedItems: string[]
  selectedDocument: DocumentDTO | null
  sortBy: 'name' | 'modified' | 'size' | 'kind'
  sortDirection: 'asc' | 'desc'
  breadcrumbs: BreadcrumbItem[]
  editingItem?: LibraryItem
  itemToEdit?: string | null
  newItemId?: string | null

  // Tree view fields
  expandedFolderIds: string[]
  expandedFolderChildren: Record<string, LibraryItem[]>
  loadingFolderIds: string[]

  // Every document and folder by name: the panel's stats and the reference picker read it
  index: LibraryIndex

  // Search index fields
  searchIndices: SearchIndex[]
  editingIndexId?: string
  editingIndex?: SearchIndex

  // Search test fields
  testingIndexId?: string
  testingIndex?: SearchIndex
  testQuery: string
  testResults: any[]
  isSearching: boolean

  // Symlink context
  isInSymlinkContext: boolean
  currentSymlinkRootId: string | null
  symlinkBasePath: string | null
  isBroken: boolean
  lastKnownPath: string | null

  // Settings
  settings?: any

  // Import/Export
  libraryImport: { status: 'idle' | 'importing' | 'success' | 'error'; errors: string[]; importedCount: number }
  libraryExport: { status: 'idle' | 'exporting' | 'success' | 'error'; errors: string[]; filePath: string; itemCount: number }

  navHistory: NavHistory<string | null>
}

/** Where an editor link into the library lands */
export type LibraryInboxEvent =
  | { type: 'EDIT_DOCUMENT'; documentId: string }
  | { type: 'NAVIGATE_TO_FOLDER'; folderId: string | null }

export type Contract = {
  state: LibraryContext
  inbox: PluginInbox<{ pack: LibraryInboxEvent }>
}
