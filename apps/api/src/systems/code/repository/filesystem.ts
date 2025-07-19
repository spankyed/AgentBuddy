import * as fs from 'fs/promises'
import * as path from 'path'
import { FileInfo, DirectoryContent, FileContent, CodeSystemError } from '../types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const PROJECT_ROOT = process.cwd()

export class FileSystemRepository {
  private validatePath(filePath: string): string {
    const normalizedPath = path.normalize(filePath)
    const absolutePath = path.isAbsolute(normalizedPath) 
      ? normalizedPath 
      : path.join(PROJECT_ROOT, normalizedPath)
    
    // const relativePath = path.relative(PROJECT_ROOT, absolutePath)

    // if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    //   throw this.createError('INVALID_PATH', 'Access denied: Path is outside project directory', filePath)
    // }

    // Allow access to any path on the system
    return absolutePath
  }

  private createError(code: CodeSystemError['code'], message: string, filePath?: string): Error {
    const error = new Error(message) as Error & { code: string; path?: string }
    error.code = code
    if (filePath) error.path = filePath
    return error
  }

  async listDirectory(dirPath: string): Promise<DirectoryContent> {
    try {
      const validPath = this.validatePath(dirPath)
      const entries = await fs.readdir(validPath, { withFileTypes: true })
      
      const files: FileInfo[] = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(validPath, entry.name)
          
          if (entry.isDirectory()) {
            return {
              name: entry.name,
              path: fullPath,
              type: 'directory' as const,
            }
          } else {
            const stats = await fs.stat(fullPath)
            return {
              name: entry.name,
              path: fullPath,
              type: 'file' as const,
              size: stats.size,
              modifiedAt: stats.mtime,
              extension: path.extname(entry.name).slice(1),
            }
          }
        })
      )
      
      files.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
      
      return {
        path: validPath,
        files,
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw this.createError('NOT_FOUND', 'Directory not found', dirPath)
      }
      if (error.code === 'EACCES') {
        throw this.createError('PERMISSION_DENIED', 'Permission denied', dirPath)
      }
      if (error.code === 'INVALID_PATH') {
        throw error
      }
      throw this.createError('IO_ERROR', error.message, dirPath)
    }
  }

  async readFile(filePath: string): Promise<FileContent> {
    try {
      const validPath = this.validatePath(filePath)
      const stats = await fs.stat(validPath)
      
      if (stats.size > MAX_FILE_SIZE) {
        throw this.createError('FILE_TOO_LARGE', `File size exceeds ${MAX_FILE_SIZE} bytes`, filePath)
      }
      
      const content = await fs.readFile(validPath, 'utf-8')
      
      return {
        path: validPath,
        content,
        encoding: 'utf-8',
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw this.createError('NOT_FOUND', 'File not found', filePath)
      }
      if (error.code === 'EACCES') {
        throw this.createError('PERMISSION_DENIED', 'Permission denied', filePath)
      }
      if (error.code === 'FILE_TOO_LARGE' || error.code === 'INVALID_PATH') {
        throw error
      }
      throw this.createError('IO_ERROR', error.message, filePath)
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const validPath = this.validatePath(filePath)
      await fs.mkdir(path.dirname(validPath), { recursive: true })
      await fs.writeFile(validPath, content, 'utf-8')
    } catch (error: any) {
      if (error.code === 'EACCES') {
        throw this.createError('PERMISSION_DENIED', 'Permission denied', filePath)
      }
      if (error.code === 'INVALID_PATH') {
        throw error
      }
      throw this.createError('IO_ERROR', error.message, filePath)
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    try {
      const validPath = this.validatePath(dirPath)
      await fs.mkdir(validPath, { recursive: true })
    } catch (error: any) {
      if (error.code === 'EACCES') {
        throw this.createError('PERMISSION_DENIED', 'Permission denied', dirPath)
      }
      if (error.code === 'INVALID_PATH') {
        throw error
      }
      throw this.createError('IO_ERROR', error.message, dirPath)
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      const validPath = this.validatePath(filePath)
      const stats = await fs.stat(validPath)
      
      if (stats.isDirectory()) {
        await fs.rmdir(validPath, { recursive: true })
      } else {
        await fs.unlink(validPath)
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw this.createError('NOT_FOUND', 'File not found', filePath)
      }
      if (error.code === 'EACCES') {
        throw this.createError('PERMISSION_DENIED', 'Permission denied', filePath)
      }
      if (error.code === 'INVALID_PATH') {
        throw error
      }
      throw this.createError('IO_ERROR', error.message, filePath)
    }
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    try {
      const validOldPath = this.validatePath(oldPath)
      const validNewPath = this.validatePath(newPath)
      await fs.rename(validOldPath, validNewPath)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw this.createError('NOT_FOUND', 'File not found', oldPath)
      }
      if (error.code === 'EACCES') {
        throw this.createError('PERMISSION_DENIED', 'Permission denied', oldPath)
      }
      if (error.code === 'INVALID_PATH') {
        throw error
      }
      throw this.createError('IO_ERROR', error.message, oldPath)
    }
  }

  async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const validPath = this.validatePath(filePath)
      const stats = await fs.stat(validPath)
      const name = path.basename(validPath)
      
      return {
        name,
        path: validPath,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        modifiedAt: stats.mtime,
        extension: stats.isFile() ? path.extname(name).slice(1) : undefined,
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw this.createError('NOT_FOUND', 'File not found', filePath)
      }
      if (error.code === 'EACCES') {
        throw this.createError('PERMISSION_DENIED', 'Permission denied', filePath)
      }
      if (error.code === 'INVALID_PATH') {
        throw error
      }
      throw this.createError('IO_ERROR', error.message, filePath)
    }
  }
}