import * as fs from 'fs/promises'
import * as path from 'path'
import { spawn } from 'child_process'
import { FileInfo, DirectoryContent, FileContent, CodeSystemError, SearchOptions, SearchResult, SearchMatch, QuickOpenResult } from '../types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export class FileSystemRepository {
  private projectRoot: string
  
  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd()
  }
  private validatePath(filePath: string): string {
    const normalizedPath = path.normalize(filePath)
    const absolutePath = path.isAbsolute(normalizedPath) 
      ? normalizedPath 
      : path.join(this.projectRoot, normalizedPath)
    
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

  async searchFiles(
    options: SearchOptions,
    onProgress?: (filesSearched: number, totalFiles: number, currentFile?: string) => void,
    onResult?: (result: SearchResult) => void
  ): Promise<SearchResult[]> {
    try {
      const validPath = this.validatePath(options.path)
      const results: SearchResult[] = []
      
      // Build ripgrep command arguments
      const args: string[] = []
      
      // Add search pattern
      if (options.useRegex) {
        args.push('-e', options.query)
      } else {
        // Escape special regex characters if not using regex mode
        const escapedQuery = options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        args.push('-F', escapedQuery)
      }
      
      // Add options
      if (!options.caseSensitive) args.push('-i')
      if (options.wholeWord) args.push('-w')
      
      // Add line numbers and column info
      args.push('--line-number', '--column', '--with-filename')
      
      // JSON output for easier parsing
      args.push('--json')
      
      // Include/exclude patterns
      if (options.includePattern) {
        args.push('-g', options.includePattern)
      }
      if (options.excludePattern) {
        args.push('-g', `!${options.excludePattern}`)
      }
      
      // Limit results if specified
      if (options.maxResults) {
        args.push('--max-count', options.maxResults.toString())
      }
      
      // Search path
      args.push(validPath)
      
      return new Promise((resolve, reject) => {
        const rg = spawn('rg', args)
        
        let currentResult: SearchResult | null = null
        let filesSearched = 0
        let errorOutput = ''
        
        rg.stdout.on('data', (data) => {
          const lines = data.toString().split('\n').filter(Boolean)
          
          for (const line of lines) {
            try {
              const json = JSON.parse(line)
              
              if (json.type === 'match') {
                const filePath = json.data.path.text
                const lineNum = json.data.line_number
                const lineText = json.data.lines.text.trimEnd()
                const match = json.data.submatches[0]
                
                if (!currentResult || currentResult.path !== filePath) {
                  if (currentResult) {
                    results.push(currentResult)
                    onResult?.(currentResult)
                  }
                  
                  currentResult = {
                    path: filePath,
                    matches: []
                  }
                  
                  filesSearched++
                  onProgress?.(filesSearched, -1, filePath)
                }
                
                currentResult.matches.push({
                  line: lineNum,
                  column: match.start + 1,
                  lineText: lineText,
                  matchStart: match.start,
                  matchEnd: match.end
                })
              }
            } catch (err) {
              // Ignore JSON parse errors
            }
          }
        })
        
        rg.stderr.on('data', (data) => {
          errorOutput += data.toString()
        })
        
        rg.on('close', (code) => {
          if (currentResult) {
            results.push(currentResult)
            onResult?.(currentResult)
          }
          
          if (code === 0 || code === 1) {
            // Code 0: matches found, Code 1: no matches found
            resolve(results)
          } else {
            // Check if ripgrep is not installed
            if (errorOutput.includes('command not found') || errorOutput.includes('not recognized')) {
              reject(this.createError('SEARCH_ERROR', 'ripgrep (rg) is not installed. Please install it to use search functionality.'))
            } else {
              reject(this.createError('SEARCH_ERROR', `Search failed: ${errorOutput}`))
            }
          }
        })
        
        rg.on('error', (err) => {
          if (err.message.includes('ENOENT')) {
            reject(this.createError('SEARCH_ERROR', 'ripgrep (rg) is not installed. Please install it to use search functionality.'))
          } else {
            reject(this.createError('SEARCH_ERROR', `Failed to start search: ${err.message}`))
          }
        })
      })
    } catch (error: any) {
      if (error.code === 'SEARCH_ERROR') {
        throw error
      }
      throw this.createError('SEARCH_ERROR', error.message)
    }
  }

  // Removed project file scanning - no longer needed
  async findTypeScriptFiles(rootPath: string): Promise<string[]> {
    return []
  }

  // Get all files recursively for quick open
  async getAllFiles(
    rootPath: string, 
    excludePatterns: string[] = [
      'node_modules',
      '.git',
      '.next',
      'dist',
      'build',
      'coverage',
      '.turbo',
      '.cache',
      '.vscode',
      '.idea',
      '*.log',
      '*.lock'
    ]
  ): Promise<QuickOpenResult[]> {
    const results: QuickOpenResult[] = []
    const validPath = this.validatePath(rootPath)
    
    const shouldExclude = (filePath: string): boolean => {
      const relativePath = path.relative(validPath, filePath)
      return excludePatterns.some(pattern => {
        // Simple glob pattern matching
        if (pattern.includes('*')) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'))
          return regex.test(relativePath)
        }
        // Direct name matching
        return relativePath.split(path.sep).some(part => part === pattern)
      })
    }
    
    const walk = async (dir: string) => {
      if (shouldExclude(dir)) return
      
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          
          if (shouldExclude(fullPath)) continue
          
          if (entry.isDirectory()) {
            await walk(fullPath)
          } else {
            const relativePath = path.relative(validPath, fullPath)
            results.push({
              path: fullPath,
              relativePath,
              name: entry.name,
              type: 'file',
              extension: path.extname(entry.name).slice(1)
            })
          }
        }
      } catch (error) {
        // Ignore permission errors and continue
        if ((error as any).code !== 'EACCES') {
          console.error(`Error reading directory ${dir}:`, error)
        }
      }
    }
    
    await walk(validPath)
    return results
  }

}