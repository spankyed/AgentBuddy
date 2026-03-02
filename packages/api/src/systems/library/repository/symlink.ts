import * as fs from 'fs/promises'
import * as path from 'path'
import { qx } from '@/core/ears/helpers/query'
import { EARS } from '@/core/types'
import type { LibraryItem, FolderItem, DocumentItem, DocumentShortCode, FolderContents, BreadcrumbItem } from '../types'
import { formatFileSize, findParentCollection } from './helpers'

const SYMLINK_PREFIX = 'symlink:'

export function isSymlinkId(id: string): boolean {
  return id.startsWith(SYMLINK_PREFIX)
}

export function buildSymlinkId(collectionId: string, relativePath: string): string {
  if (!relativePath || relativePath === '.' || relativePath === '/') {
    return collectionId
  }
  return `${SYMLINK_PREFIX}${collectionId}/${relativePath}`
}

export function parseSymlinkId(id: string): { collectionId: string; relativePath: string } | null {
  if (!isSymlinkId(id)) return null
  const rest = id.slice(SYMLINK_PREFIX.length)
  const slashIdx = rest.indexOf('/')
  if (slashIdx === -1) return null
  const collectionId = rest.slice(0, slashIdx)
  const relativePath = rest.slice(slashIdx + 1)
  return { collectionId, relativePath }
}

export function getSymlinkCollectionPath(collectionId: string): string | null {
  const collections = qx(collectionId as EARS.EntityId).pickAll()
  const collection = collections[0]
  if (!collection) return null
  return (collection.symlinkPath as string) || null
}

export function isSymlinkCollection(collectionId: string): boolean {
  return !!getSymlinkCollectionPath(collectionId)
}

export function resolveSymlinkPath(id: string): { collectionId: string; absolutePath: string } | null {
  // Case 1: It's a symlink-prefixed ID (subfolder/file inside symlink)
  if (isSymlinkId(id)) {
    const parsed = parseSymlinkId(id)
    if (!parsed) return null
    const basePath = getSymlinkCollectionPath(parsed.collectionId)
    if (!basePath) return null
    return {
      collectionId: parsed.collectionId,
      absolutePath: path.join(basePath, parsed.relativePath),
    }
  }

  // Case 2: It's a Collection ID that might be a symlink root
  const symlinkPath = getSymlinkCollectionPath(id)
  if (symlinkPath) {
    return {
      collectionId: id,
      absolutePath: symlinkPath,
    }
  }

  return null
}

export async function listDirectory(dirPath: string, collectionId: string, relativePath: string = ''): Promise<LibraryItem[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const items: LibraryItem[] = []
  const now = new Date().toISOString()

  for (const entry of entries) {
    // Skip hidden files/directories
    if (entry.name.startsWith('.')) continue

    const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
    const fullPath = path.join(dirPath, entry.name)
    const itemId = buildSymlinkId(collectionId, entryRelPath) as EARS.EntityId

    let stat
    try {
      stat = await fs.stat(fullPath)
    } catch {
      continue
    }

    if (entry.isDirectory()) {
      let childCount = 0
      try {
        const children = await fs.readdir(fullPath)
        childCount = children.filter(c => !c.startsWith('.')).length
      } catch {
        // ignore
      }

      items.push({
        type: 'folder',
        id: itemId,
        name: entry.name,
        parentId: null,
        childCount,
        size: childCount === 1 ? '1 item' : `${childCount} items`,
        kind: 'Folder',
        displayOrder: 0,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        isSymlinked: true,
      })
    } else {
      items.push({
        type: 'document',
        id: itemId,
        name: entry.name,
        shortCode: 'DOC-0' as DocumentShortCode,
        parentId: null,
        content: [],
        tags: [],
        size: formatFileSize(stat.size),
        kind: 'Document',
        displayOrder: 0,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        isSymlinked: true,
        filePath: fullPath,
      })
    }
  }

  // Sort: folders first, then alphabetical
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return items
}

export async function getSymlinkFolderContents(folderId: string): Promise<FolderContents | null> {
  const resolved = resolveSymlinkPath(folderId)
  if (!resolved) return null

  const { collectionId, absolutePath } = resolved

  // Check if directory exists
  try {
    const stat = await fs.stat(absolutePath)
    if (!stat.isDirectory()) return null
  } catch {
    return null
  }

  // Determine relative path for building child IDs
  const basePath = getSymlinkCollectionPath(collectionId)
  if (!basePath) return null

  const relativePath = path.relative(basePath, absolutePath)
  const items = await listDirectory(absolutePath, collectionId, relativePath === '.' ? '' : relativePath)

  // Build breadcrumbs
  const breadcrumbs = buildSymlinkBreadcrumbs(collectionId, relativePath === '.' ? '' : relativePath)

  return {
    items,
    currentPath: [],
    currentFolderId: folderId as EARS.EntityId,
    breadcrumbs,
  }
}

function buildSymlinkBreadcrumbs(collectionId: string, relativePath: string): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = []

  // Get the collection name for the root breadcrumb
  const collections = qx(collectionId as EARS.EntityId).pickAll()
  const collection = collections[0]
  if (!collection) return breadcrumbs

  // Add EARS parent breadcrumbs for the symlink collection
  let parentId: EARS.EntityId | null = findParentCollection(collectionId as EARS.EntityId)
  const parentCrumbs: BreadcrumbItem[] = []
  while (parentId) {
    const parents = qx(parentId).pickAll()
    const parent = parents[0]
    if (parent) {
      parentCrumbs.unshift({
        id: parentId,
        name: parent.name as string,
        path: [],
      })
    }
    parentId = findParentCollection(parentId)
  }
  breadcrumbs.push(...parentCrumbs)

  // Add the symlink root
  breadcrumbs.push({
    id: collectionId as EARS.EntityId,
    name: collection.name as string,
    path: [],
  })

  // Add subdirectory breadcrumbs
  if (relativePath) {
    const parts = relativePath.split('/')
    let currentRelPath = ''
    for (const part of parts) {
      currentRelPath = currentRelPath ? `${currentRelPath}/${part}` : part
      breadcrumbs.push({
        id: buildSymlinkId(collectionId, currentRelPath) as EARS.EntityId,
        name: part,
        path: [],
      })
    }
  }

  return breadcrumbs
}

export async function createFile(dirPath: string, name: string): Promise<void> {
  const filePath = path.join(dirPath, name)
  await fs.writeFile(filePath, '', 'utf-8')
}

export async function createDirectory(dirPath: string, name: string): Promise<void> {
  const fullPath = path.join(dirPath, name)
  await fs.mkdir(fullPath, { recursive: true })
}

export async function renameItem(oldPath: string, newName: string): Promise<void> {
  const dir = path.dirname(oldPath)
  const newPath = path.join(dir, newName)
  await fs.rename(oldPath, newPath)
}

export async function deleteItems(paths: string[]): Promise<void> {
  for (const itemPath of paths) {
    const stat = await fs.stat(itemPath)
    if (stat.isDirectory()) {
      await fs.rm(itemPath, { recursive: true })
    } else {
      await fs.unlink(itemPath)
    }
  }
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8')
}
