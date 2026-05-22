import * as path from 'path'
import { repository } from '@/repository';
import type { DocumentDTO, DocumentShortCode, CollectionDTO, LibraryItem, ContentSection } from '@/systems/library/types';
import { EARS } from '@/core/types';
import * as symlink from '@/systems/library/repository/symlink';


// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'json', 'html', 'css',
  'yaml', 'yml', 'go', 'rs', 'java', 'c', 'cpp', 'rb',
  'sh', 'sql', 'xml', 'vue', 'php', 'swift', 'kt', 'scss',
  'less', 'jsonc',
])

function getContentInfoForFile(name: string): { type: 'markdown' } | { type: 'code'; language: string } | { type: 'text' } {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'md') return { type: 'markdown' }
  if (CODE_EXTENSIONS.has(ext)) return { type: 'code', language: ext }
  return { type: 'text' }
}

function normalizeContent(content: string | ContentSection[]): ContentSection[] {
  if (typeof content === 'string') {
    return [{ type: 'markdown' as const, text: content }]
  }
  return content
}

function makeSymlinkDocumentDTO(id: string, name: string, content: ContentSection[]): DocumentDTO {
  return {
    id,
    name,
    content,
    shortCode: 'DOC-0' as DocumentShortCode,
    tags: [],
    displayOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as DocumentDTO
}

function makeSymlinkCollectionDTO(id: string, name: string): CollectionDTO {
  return {
    id,
    name,
    path: [],
    documentCount: 0,
    childCollections: [],
    displayOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as CollectionDTO
}

// ---------------------------------------------------------------------------
// LibraryService
// ---------------------------------------------------------------------------

export class LibraryService {
  // Lookups

  async get(id: EARS.EntityId): Promise<DocumentDTO | undefined> {
    if (symlink.isSymlinkId(id)) {
      const resolved = symlink.resolveSymlinkPath(id)
      if (!resolved) return undefined
      const text = await symlink.readFile(resolved.absolutePath)
      const name = path.basename(resolved.absolutePath)
      const info = getContentInfoForFile(name)
      const section: ContentSection = info.type === 'code'
        ? { type: 'code', text, language: info.language }
        : { type: info.type, text }
      return makeSymlinkDocumentDTO(id, name, [section])
    }
    const document = repository.libraryQueries.getDocument(id);
    return document || undefined;
  }

  async getByCode(shortCode: string): Promise<DocumentDTO | undefined> {
    const document = repository.libraryQueries.getDocumentByShortCode(shortCode as DocumentShortCode);
    return document || undefined;
  }

  async getByName(name: string): Promise<DocumentDTO | undefined> {
    const allDocuments = repository.libraryQueries.getDocuments();
    return allDocuments.find((doc: DocumentDTO) => doc.name === name);
  }

  async getByPath(collectionPath: string[], name: string): Promise<DocumentDTO | undefined> {
    const allDocuments = repository.libraryQueries.getDocuments();
    return allDocuments.find((doc: DocumentDTO) => {
      if (doc.name !== name) return false;
      const docPath = doc.collectionPath ?? [];
      if (docPath.length !== collectionPath.length) return false;
      return collectionPath.every((seg, i) => docPath[i] === seg);
    });
  }

  async getText(id: EARS.EntityId): Promise<string | undefined> {
    const doc = await this.get(id)
    if (!doc) return undefined
    return doc.content
      .filter((s): s is Extract<ContentSection, { type: 'markdown' }> | Extract<ContentSection, { type: 'text' }> | Extract<ContentSection, { type: 'code' }> => s.type === 'markdown' || s.type === 'text' || s.type === 'code')
      .map(s => s.text)
      .join('\n')
  }

  async list(folderId?: EARS.EntityId): Promise<LibraryItem[]> {
    const folderContents = await repository.libraryQueries.getFolderContents(folderId ?? null)
    return folderContents.items
  }

  // Mutations

  async create(params: {
    name: string;
    content: string | ContentSection[];
    tags?: string[];
    parentId?: string;
  }): Promise<DocumentDTO> {
    const { name, parentId } = params
    const content = normalizeContent(params.content)
    const tags = params.tags ?? []

    const resolved = parentId ? symlink.resolveSymlinkPath(parentId) : null
    if (resolved) {
      await symlink.createFile(resolved.absolutePath, name)
      const textContent = content
        .filter((s): s is Extract<ContentSection, { type: 'markdown' }> | Extract<ContentSection, { type: 'text' }> | Extract<ContentSection, { type: 'code' }> => s.type === 'markdown' || s.type === 'text' || s.type === 'code')
        .map(s => s.text)
        .join('\n')
      if (textContent) {
        const filePath = path.join(resolved.absolutePath, name)
        await symlink.writeFile(filePath, textContent)
      }
      const newId = symlink.buildSymlinkId(resolved.collectionId,
        path.relative(
          symlink.getSymlinkCollectionPath(resolved.collectionId) || resolved.absolutePath,
          path.join(resolved.absolutePath, name)
        )
      )
      return makeSymlinkDocumentDTO(newId, name, content)
    }

    return repository.libraryCommands.createDocument(
      name,
      content,
      tags,
      parentId ? parentId as EARS.EntityId : undefined
    )
  }

  async update(params: {
    id: string;
    name?: string;
    content?: string | ContentSection[];
    tags?: string[];
  }): Promise<DocumentDTO> {
    const { id } = params

    if (symlink.isSymlinkId(id)) {
      const resolved = symlink.resolveSymlinkPath(id)
      const currentName = resolved ? path.basename(resolved.absolutePath) : 'unknown'
      const name = params.name ?? currentName
      const content = params.content !== undefined ? normalizeContent(params.content) : [{ type: 'text' as const, text: '' }]

      if (resolved) {
        const textContent = content
          .filter((s): s is Extract<ContentSection, { type: 'markdown' }> | Extract<ContentSection, { type: 'text' }> | Extract<ContentSection, { type: 'code' }> => s.type === 'markdown' || s.type === 'text' || s.type === 'code')
          .map(s => s.text)
          .join('\n')
        await symlink.writeFile(resolved.absolutePath, textContent)
      }
      return makeSymlinkDocumentDTO(id, name, content)
    }

    // For DB documents, fetch existing to fill in missing fields
    const existing = repository.libraryQueries.getDocument(id as EARS.EntityId)
    if (!existing) throw new Error(`Document not found: ${id}`)

    const name = params.name ?? existing.name
    const content = params.content !== undefined ? normalizeContent(params.content) : existing.content
    const tags = params.tags ?? existing.tags

    return repository.libraryCommands.updateDocument(
      id as EARS.EntityId,
      name,
      content,
      tags,
      existing.collectionId
    )
  }

  async createFolder(params: {
    name: string;
    parentId?: string;
  }): Promise<CollectionDTO> {
    const { name, parentId } = params

    const resolved = parentId ? symlink.resolveSymlinkPath(parentId) : null
    if (resolved) {
      await symlink.createDirectory(resolved.absolutePath, name)
      const newId = symlink.buildSymlinkId(resolved.collectionId,
        path.relative(
          symlink.getSymlinkCollectionPath(resolved.collectionId) || resolved.absolutePath,
          path.join(resolved.absolutePath, name)
        )
      )
      return makeSymlinkCollectionDTO(newId, name)
    }

    return repository.libraryCommands.createCollection(
      name,
      undefined,
      parentId ? parentId as EARS.EntityId : undefined
    )
  }

  async remove(ids: string[]): Promise<void> {
    const symlinkIds = ids.filter(id => symlink.isSymlinkId(id))
    const regularIds = ids.filter(id => !symlink.isSymlinkId(id))

    if (symlinkIds.length > 0) {
      const paths: string[] = []
      for (const id of symlinkIds) {
        const resolved = symlink.resolveSymlinkPath(id)
        if (resolved) paths.push(resolved.absolutePath)
      }
      if (paths.length > 0) {
        await symlink.deleteItems(paths)
      }
    }

    if (regularIds.length > 0) {
      repository.libraryCommands.deleteItems(regularIds.map(id => id as EARS.EntityId))
    }
  }

  async move(ids: string[], targetFolderId: string | null): Promise<void> {
    const symlinkIds = ids.filter(id => symlink.isSymlinkId(id))
    const regularIds = ids.filter(id => !symlink.isSymlinkId(id))

    if (symlinkIds.length > 0 && targetFolderId) {
      const targetResolved = symlink.resolveSymlinkPath(targetFolderId)
      if (targetResolved) {
        for (const id of symlinkIds) {
          const sourceResolved = symlink.resolveSymlinkPath(id)
          if (sourceResolved) {
            await symlink.moveItem(sourceResolved.absolutePath, targetResolved.absolutePath)
          }
        }
      }
    }

    if (regularIds.length > 0) {
      repository.libraryCommands.moveItems(
        regularIds.map(id => id as EARS.EntityId),
        targetFolderId ? targetFolderId as EARS.EntityId : null
      )
    }
  }

  async rename(id: string, newName: string): Promise<void> {
    if (symlink.isSymlinkId(id)) {
      const resolved = symlink.resolveSymlinkPath(id)
      if (resolved) {
        await symlink.renameItem(resolved.absolutePath, newName)
      }
      return
    }

    // For DB items, determine type from existence checks
    const doc = repository.libraryQueries.getDocument(id as EARS.EntityId)
    if (doc) {
      repository.libraryCommands.updateDocument(
        id as EARS.EntityId,
        newName,
        doc.content,
        doc.tags,
        doc.collectionId
      )
      return
    }

    // Must be a collection
    const collections = repository.libraryQueries.getCollections()
    const collection = collections.find((c: CollectionDTO) => c.id === id)
    if (collection) {
      repository.libraryCommands.updateCollection(
        id as EARS.EntityId,
        newName,
        collection.description
      )
    }
  }
}

export const libraryService = new LibraryService();
