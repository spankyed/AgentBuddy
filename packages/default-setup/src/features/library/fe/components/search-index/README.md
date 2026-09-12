# Create Search Index Modal

A comprehensive modal dialog for creating and configuring text embedding search indexes for documents.

## Features

### Three-Tab Interface

#### 1. Details Tab
- **Index Name**: Required field for naming the search index
- **About Index**: Optional description textarea
- **Embedding Model**: Select from available models:
  - `all-MiniLM-L6-v2` (Fast, Local)
  - `text-embedding-3-small` (OpenAI)
  - `text-embedding-3-large` (OpenAI)
- **Index Metric**: Radio selection between:
  - Cosine similarity
  - Dot product
- **Connectors**: Segmented slider for graph connectivity (8, 16, 32, 64)
  - 8: Smaller index, faster search
  - 16: Balanced (default)
  - 32: Better recall
  - 64: Larger index, higher recall

#### 2. Scope Tab
- **Exclude All Subfolders**: Toggle to index only root folder documents
- **Excluded Subfolders**: List with folder selector dialog
- **Excluded Documents**: List with document selector dialog
- Both exclusion lists support:
  - Visual list of excluded items
  - Remove buttons for each item
  - Dialog-based selection with search

#### 3. Sections Tab
- **Enable Section-based Indexing**: Global toggle for section filtering
- **Pick Segments** (Collapsible):
  - Define rules for segments to include
  - Rule configuration:
    - Type: Text Block, List, or Key:Value
    - Occurrence: first, last, all, N, or N-X range
    - Key field (only for Key:Value type)
  - Add/remove rules dynamically
- **Construct Document** (Collapsible):
  - Template-based document construction
  - Variables like `{{segment 1}}`, `{{segment 2}}`
  - Live preview of template output

## Usage

```vue
<template>
  <div>
    <button @click="showDialog = true">Create Search Index</button>
    
    <CreateSearchIndexDialog
      v-model="showDialog"
      :initial-data="initialConfig"
      @confirm="handleCreateIndex"
      @cancel="handleCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import CreateSearchIndexDialog from './CreateSearchIndexDialog.vue'
import type { SearchIndexFormData } from '../types/search-index'

const showDialog = ref(false)

const initialConfig: Partial<SearchIndexFormData> = {
  embeddingModel: 'all-MiniLM-L6-v2',
  indexMetric: 'cosine',
  connectors: 16
}

function handleCreateIndex(data: SearchIndexFormData) {
  console.log('Index configuration:', data)
  // Send to backend API
}

function handleCancel() {
  console.log('Dialog cancelled')
}
</script>
```

## Component Structure

```
search-index/
├── DetailsTab.vue       # Index configuration settings
├── ScopeTab.vue         # Folder/document exclusion
├── SectionsTab.vue      # Content section configuration
├── FolderSelectorDialog.vue    # Folder selection modal
├── DocumentSelectorDialog.vue  # Document selection modal
└── README.md

form/
├── SegmentedSlider.vue  # Custom slider for connectors
├── ToggleSwitch.vue     # Toggle switch component
└── OccurrenceInput.vue  # Special input for occurrence patterns
```

## Data Structure

The modal outputs a `SearchIndexFormData` object:

```typescript
interface SearchIndexFormData {
  // Details
  name: string
  description: string
  embeddingModel: 'all-MiniLM-L6-v2' | 'text-embedding-3-small' | 'text-embedding-3-large'
  indexMetric: 'cosine' | 'dot_product'
  connectors: 8 | 16 | 32 | 64

  // Scope
  excludeAllSubfolders: boolean
  excludedFolderIds: string[]
  excludedDocumentIds: string[]

  // Sections
  enableSectionIndexing: boolean
  segmentRules: SegmentRule[]
  constructTemplate: string
}

interface SegmentRule {
  id: string
  type: 'text' | 'list' | 'field'
  occurrence: string // "first" | "last" | "all" | N | N-X
  key?: string // Only for 'field' type
}
```

## Backend Integration

The frontend is ready for backend integration. Required backend endpoints:

1. **Create Index**: `POST /api/search-index`
2. **Get Folders**: `GET /api/library/folders` (for folder selector)
3. **Get Documents**: `GET /api/library/documents` (for document selector)
4. **Process Embedding**: Integration with fastembed/usearch libraries

## Styling

The components use:
- Tailwind CSS for utility classes
- Custom neutral color palette
- Cyan accent colors for primary actions
- Smooth transitions and hover states
- Dark theme optimized for the application

## Future Enhancements

- [ ] Add validation for index name uniqueness
- [ ] Implement real folder/document fetching from API
- [ ] Add progress indicators for index creation
- [ ] Support for editing existing indexes
- [ ] Add index size estimation
- [ ] Implement search testing interface