# Thread Export/Import Overhaul Plan

## Problem
The current thread export is a minimal "basic data backup" — it only captures thread metadata, message text, and inter-thread relations. A large amount of data is lost on export/import roundtrip.

## Current Export Format (v1)

### What's exported
- **Thread**: `topic`, `instructions`, `status`, `tags`, `shortCode`, `timestamp`, `sideTopics`, `pinned`, `linkedThreads`
- **Message**: `text`, `sender`, `timestamp`
- **Relations**: `parent_of`, `blocks`, `blocked_by`, `duplicates` (via shortCode mapping)
- **Media**: Only from thread `instructions` (not messages)

### What's lost
| Category | Missing Fields | Impact |
|----------|---------------|--------|
| **Message content** | `blocks`, `blockResponse`, `responseTimestamp` | Interactive message blocks (prompts, choices, approvals, button groups) are lost entirely |
| **Message metadata** | `forkable`, `isCommand`, `command`, `createdAt`, `updatedAt` | Command history and fork points lost |
| **Message references** | `references.images`, `references.files`, `references.context` | Attached images, files, and context references (thread/doc/note/task links) lost |
| **Soft deletes** | `deleted`, `deletedAt` on messages | Deleted messages silently excluded (acceptable, but should be intentional) |
| **Thread metadata** | `lastMessageTimestamp`, `lastVisitedTimestamp`, `forcedMode`, `createdAt`, `updatedAt` | Minor — these are derivable or transient |
| **Artifacts** | Entire `Artifact` entity (text, code, image, json, graph, table, slack) | All artifacts lost |
| **Fork relations** | `forked_from` relation | Fork lineage lost |
| **Link protocols in messages** | `note://`, `thread://`, `doc://` etc. in message text | Inline reference links point to non-existent old IDs after import |

## Proposed Export Format (v2)

```typescript
// ── Export Types ──────────────────────────────────────────

interface ExportedMessageV2 {
  text: string
  sender: 'user' | 'assistant' | 'system'
  timestamp: number
  responseTimestamp?: number
  blocks?: BlockConfig[]
  blockResponse?: any
  forkable?: boolean
  isCommand?: boolean
  command?: string
  references?: {
    images?: ImageReference[]
    files?: FileReference[]         // file paths won't survive cross-machine — see notes
    context?: ContextReference[]    // refIds will need remapping
  }
}

interface ExportedArtifact {
  id: string                        // original ID for remapping
  type: 'text' | 'code' | 'image' | 'json' | 'graph' | 'table' | 'slack'
  title: string
  content: string
  language?: string
  metadata?: Record<string, any>
}

interface ExportedThreadV2 {
  id: string                        // original ID for link remapping
  topic: string
  instructions: string
  status: string
  tags: string[]
  shortCode: string
  timestamp: number
  createdAt: number
  sideTopics?: string[]
  pinned?: boolean
  messages: ExportedMessageV2[]
  linkedThreads: ExportedThreadLink[]  // unchanged
  forkedFrom?: string                  // shortCode of parent fork
  artifacts: ExportedArtifact[]
}

interface ExportedThreadsData {
  version: 2
  threads: ExportedThreadV2[]
}
```

## Implementation Plan

### Phase 1: Expand export format
**Files**: `export-types.ts`, `export-threads.ts`

1. Add new fields to `ExportedMessageV2` and `ExportedThreadV2`
2. Include `id` on threads for cross-reference remapping
3. Export `blocks`, `blockResponse`, `references` from messages
4. Export artifacts related to each thread
5. Export `forked_from` relations via shortCode
6. Bump version to `2`

### Phase 2: Expand import with remapping
**File**: `import-threads.ts`

1. Support version detection (v1 vs v2) for backward compatibility
2. Build `oldThreadId → newThreadId` mapping (similar to notes `oldId → newId`)
3. Remap `context.refId` in message references using the ID mapping
4. Remap inline link protocols in message text (`note://`, `thread://`, `doc://`, etc.)
   - `thread://` links can use `oldId → newId` mapping from this import
   - `note://`, `doc://` etc. reference other systems — best-effort title matching or skip
5. Restore artifacts and link them to imported threads
6. Restore `forked_from` relations via shortCode mapping
7. Handle `FileReference.path` gracefully (paths are machine-specific — mark as broken or strip)

### Phase 3: Media in messages
**Files**: `export-threads.ts`, `import-threads.ts`, `media.ts`

1. Scan message `text` for `media://` refs (currently only scans `instructions`)
2. Also scan `references.images[].url` for `media://` refs
3. Copy media files during export
4. Restore media refs with new entity IDs during import

### Phase 4: Cross-system link remapping
**File**: `import-threads.ts`

Message text can contain links to entities from other systems:
- `[label](thread://T-42)` → remap using shortCode→newId mapping
- `[label](note://Note-abc)` → can't remap without a cross-system ID map
- `[label](doc://Doc-xyz)` → same limitation

Options:
- **Option A**: Accept that cross-system links break on import (document in import result warnings)
- **Option B**: Accept an optional cross-system ID map parameter for coordinated multi-system imports
- **Option C**: Strip unresolvable cross-system links and warn

Recommendation: **Option A** for now, with clear error reporting. Cross-system import coordination is a separate feature.

## Edge Cases & Decisions

- **Soft-deleted messages**: Continue excluding from export (they're invisible to the user). Document this behavior.
- **File references**: Export the metadata but warn that `path` fields are machine-specific and won't resolve on a different machine.
- **Block responses**: Export as opaque JSON. Block types may evolve — import should tolerate unknown block types gracefully.
- **Version migration**: v1 imports continue working unchanged. v2 import path handles the new fields. Detection via `version` field in the JSON.
- **Artifact media**: If artifacts contain `media://` refs, include in media export scan.
- **lastMessageTimestamp / lastVisitedTimestamp**: Don't export — these are transient/derivable.

## Migration Path
- v1 → v2: No migration needed. v1 exports continue to import via the existing code path. New exports use v2 format.
- The import function checks `data.version` and routes to the appropriate handler.
