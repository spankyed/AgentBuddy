import * as path from 'path'
import { repository } from '@/repository';
import type { DocumentDTO, DocumentShortCode, CollectionDTO, LibraryItem, FolderContents, LibraryResult, ContentSection } from '@/systems/library/types';
import { EARS } from '@/core/types';
import * as symlink from '@/systems/library/repository/symlink';

function makeSymlinkDocumentDTO(id: string, name: string, content: any[]): DocumentDTO {
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

export class LibraryService {
  async getById(id: EARS.EntityId): Promise<DocumentDTO | undefined> {
    if (symlink.isSymlinkId(id)) {
      const resolved = symlink.resolveSymlinkPath(id)
      if (!resolved) return undefined
      const content = await symlink.readFile(resolved.absolutePath)
      const name = path.basename(resolved.absolutePath)
      return makeSymlinkDocumentDTO(id, name, [{ type: 'text' as const, text: content }])
    }
    const document = repository.libraryQueries.getDocument(id);
    return document || undefined;
  }

  async getDocByCode(shortCode: string): Promise<DocumentDTO | undefined> {
    const document = repository.libraryQueries.getDocumentByShortCode(shortCode as DocumentShortCode);
    return document || undefined;
  }

  async getByName(name: string): Promise<DocumentDTO | undefined> {
    const allDocuments = repository.libraryQueries.getDocuments();
    return allDocuments.find(doc => doc.name === name);
  }

  async getWithinFolder(folderName: string): Promise<DocumentDTO[]> {
    const collection = repository.libraryQueries.getCollectionByName(folderName);

    if (!collection) {
      return [];
    }

    return repository.libraryQueries.getDocumentsInCollection(collection.id);
  }

  async createDocument(params: {
    name: string;
    content: ContentSection[];
    tags: string[];
    collectionId?: string;
  }): Promise<LibraryResult<DocumentDTO>> {
    const { name, content, tags, collectionId } = params

    const resolved = collectionId ? symlink.resolveSymlinkPath(collectionId) : null
    if (resolved) {
      await symlink.createFile(resolved.absolutePath, name)
      const folderContents = await repository.libraryQueries.getFolderContents(collectionId as EARS.EntityId)
      return { kind: 'refresh', folderContents }
    }

    const document = repository.libraryCommands.createDocument(
      name,
      content,
      tags,
      collectionId ? collectionId as EARS.EntityId : undefined
    )
    return { kind: 'item', data: document }
  }

  async updateDocument(params: {
    id: string;
    name: string;
    content: ContentSection[];
    tags: string[];
    collectionId?: string;
  }): Promise<DocumentDTO> {
    const { id, name, content, tags, collectionId } = params

    if (symlink.isSymlinkId(id)) {
      const resolved = symlink.resolveSymlinkPath(id)
      if (resolved) {
        const textContent = content
          .filter((section: any) => section.type === 'text')
          .map((section: any) => section.text)
          .join('\n')
        await symlink.writeFile(resolved.absolutePath, textContent)
      }
      return makeSymlinkDocumentDTO(id, name, content)
    }

    return repository.libraryCommands.updateDocument(
      id as EARS.EntityId,
      name,
      content,
      tags,
      collectionId ? collectionId as EARS.EntityId : undefined
    )
  }

  async createCollection(params: {
    name: string;
    description?: string;
    parentId?: string;
  }): Promise<LibraryResult<CollectionDTO>> {
    const { name, description, parentId } = params

    const resolved = parentId ? symlink.resolveSymlinkPath(parentId) : null
    if (resolved) {
      await symlink.createDirectory(resolved.absolutePath, name)
      const folderContents = await repository.libraryQueries.getFolderContents(parentId as EARS.EntityId)
      return { kind: 'refresh', folderContents }
    }

    const collection = repository.libraryCommands.createCollection(
      name,
      description,
      parentId ? parentId as EARS.EntityId : undefined
    )
    return { kind: 'item', data: collection }
  }

  async renameItem(params: {
    id: string;
    name: string;
    itemType: 'document' | 'folder';
  }): Promise<LibraryResult<LibraryItem>> {
    const { id, name, itemType } = params

    if (symlink.isSymlinkId(id)) {
      const resolved = symlink.resolveSymlinkPath(id)
      if (resolved) {
        await symlink.renameItem(resolved.absolutePath, name)
      }
      // Refresh parent folder
      const parsed = symlink.parseSymlinkId(id)
      if (parsed) {
        const parentRelPath = resolved?.absolutePath
          ? path.dirname(path.relative(
              symlink.getSymlinkCollectionPath(parsed.collectionId) || '',
              resolved.absolutePath
            ))
          : ''
        const parentFolderId = parentRelPath && parentRelPath !== '.'
          ? symlink.buildSymlinkId(parsed.collectionId, parentRelPath)
          : parsed.collectionId
        const folderContents = await repository.libraryQueries.getFolderContents(parentFolderId as EARS.EntityId)
        return { kind: 'refresh', folderContents }
      }
      // Fallback: return a refresh with root contents
      const folderContents = await repository.libraryQueries.getFolderContents(null)
      return { kind: 'refresh', folderContents }
    }

    const item = repository.libraryCommands.renameItem(id as EARS.EntityId, name, itemType)
    return { kind: 'item', data: item }
  }

  async deleteItems(ids: string[]): Promise<void> {
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

  async moveItems(params: {
    ids: string[];
    targetFolderId: string | null;
  }): Promise<void> {
    const { ids, targetFolderId } = params
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
}

export const libraryService = new LibraryService();
