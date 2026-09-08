import * as fs from 'fs/promises'
import * as path from 'path'

export interface FileEntry {
  name: string
  isDirectory: boolean
}

export interface FileStat {
  size: number
  mtime: Date
  isDirectory: boolean
  isFile: boolean
}

export interface FilesystemServiceType {
  writeFile(filePath: string, content: string): Promise<void>
  readFile(filePath: string): Promise<string>
  exists(filePath: string): Promise<boolean>
  mkdir(dirPath: string): Promise<void>
  readDir(dirPath: string): Promise<FileEntry[]>
  remove(targetPath: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  stat(filePath: string): Promise<FileStat>
}

function createFilesystemService(): FilesystemServiceType {
  return {
    async writeFile(filePath: string, content: string): Promise<void> {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, content, 'utf-8')
    },

    async readFile(filePath: string): Promise<string> {
      return fs.readFile(filePath, 'utf-8')
    },

    async exists(filePath: string): Promise<boolean> {
      try {
        await fs.access(filePath)
        return true
      } catch {
        return false
      }
    },

    async mkdir(dirPath: string): Promise<void> {
      await fs.mkdir(dirPath, { recursive: true })
    },

    async readDir(dirPath: string): Promise<FileEntry[]> {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      return entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
      }))
    },

    async remove(targetPath: string): Promise<void> {
      await fs.rm(targetPath, { recursive: true, force: true })
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      await fs.rename(oldPath, newPath)
    },

    async stat(filePath: string): Promise<FileStat> {
      const s = await fs.stat(filePath)
      return {
        size: s.size,
        mtime: s.mtime,
        isDirectory: s.isDirectory(),
        isFile: s.isFile(),
      }
    },
  }
}

export const filesystemService = createFilesystemService()
