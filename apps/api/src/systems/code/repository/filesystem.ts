import * as fs from 'fs/promises'
import * as path from 'path'
import { spawn } from 'child_process'
import { FileInfo, DirectoryContent, FileContent, CodeSystemError, SearchOptions, SearchResult, SearchMatch } from '../types'

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

  async findTypeScriptFiles(rootPath: string): Promise<string[]> {
    // Now finds all text files, not just TypeScript
    return this.findProjectTextFiles(rootPath)
  }

  async findProjectTextFiles(rootPath: string): Promise<string[]> {
    try {
      const validPath = this.validatePath(rootPath)
      const files: string[] = []
      
      // Use ripgrep to find all text files
      const args = [
        '--files', // List files only, don't search content
        // TypeScript/JavaScript
        '--glob', '*.ts',
        '--glob', '*.tsx',
        '--glob', '*.js',
        '--glob', '*.jsx',
        '--glob', '*.mjs',
        '--glob', '*.cjs',
        '--glob', '*.d.ts',
        // Vue
        '--glob', '*.vue',
        // JSON/Config
        '--glob', '*.json',
        '--glob', '*.jsonc',
        '--glob', '*.json5',
        // CSS/Styles
        '--glob', '*.css',
        '--glob', '*.scss',
        '--glob', '*.sass',
        '--glob', '*.less',
        // HTML/Markup
        '--glob', '*.html',
        '--glob', '*.htm',
        '--glob', '*.xml',
        '--glob', '*.svg',
        // YAML
        '--glob', '*.yaml',
        '--glob', '*.yml',
        // Markdown
        '--glob', '*.md',
        '--glob', '*.mdx',
        // Config files
        '--glob', '*.env',
        '--glob', '*.env.*',
        '--glob', '.eslintrc*',
        '--glob', '.prettierrc*',
        '--glob', 'tsconfig*.json',
        '--glob', 'package.json',
        '--glob', 'Dockerfile',
        '--glob', '*.dockerfile',
        '--glob', 'Makefile',
        '--glob', '*.toml',
        '--glob', '*.ini',
        '--glob', '*.cfg',
        '--glob', '*.conf',
        // Shell scripts
        '--glob', '*.sh',
        '--glob', '*.bash',
        '--glob', '*.zsh',
        // Other common text files
        '--glob', '*.py',
        '--glob', '*.rb',
        '--glob', '*.go',
        '--glob', '*.rs',
        '--glob', '*.java',
        '--glob', '*.kt',
        '--glob', '*.php',
        '--glob', '*.c',
        '--glob', '*.cpp',
        '--glob', '*.h',
        '--glob', '*.hpp',
        // Exclude common directories
        '--glob', '!node_modules/**',
        '--glob', '!dist/**',
        '--glob', '!build/**',
        '--glob', '!coverage/**',
        '--glob', '!.git/**',
        '--glob', '!*.min.js',
        '--glob', '!*.min.css',
        '--glob', '!vendor/**',
        '--glob', '!.next/**',
        '--glob', '!.nuxt/**',
        '--glob', '!out/**',
        validPath
      ]
      
      return new Promise((resolve, reject) => {
        const rg = spawn('rg', args)
        let output = ''
        let errorOutput = ''
        
        rg.stdout.on('data', (data) => {
          output += data.toString()
        })
        
        rg.stderr.on('data', (data) => {
          errorOutput += data.toString()
        })
        
        rg.on('close', (code) => {
          if (code === 0 || code === 1) {
            const fileList = output
              .split('\n')
              .filter(Boolean)
              .map(file => file.trim())
            resolve(fileList)
          } else {
            if (errorOutput.includes('command not found') || errorOutput.includes('not recognized')) {
              // Fallback to using find command if ripgrep is not available
              this.findTypeScriptFilesWithFind(validPath).then(resolve).catch(reject)
            } else {
              reject(this.createError('IO_ERROR', `Failed to find TypeScript files: ${errorOutput}`))
            }
          }
        })
        
        rg.on('error', (err) => {
          // Fallback to using find command
          this.findTypeScriptFilesWithFind(validPath).then(resolve).catch(reject)
        })
      })
    } catch (error: any) {
      throw this.createError('IO_ERROR', error.message)
    }
  }

  private async findTypeScriptFilesWithFind(rootPath: string): Promise<string[]> {
    // Fallback implementation using Node.js fs
    const files: string[] = []
    const excludeDirs = ['node_modules', 'dist', 'build', 'coverage', '.git', 'vendor', '.next', '.nuxt', 'out']
    const excludeFiles = ['.min.js', '.min.css']
    
    // All text file extensions we want to include
    const extensions = new Set([
      // TypeScript/JavaScript
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts',
      // Vue
      '.vue',
      // JSON/Config
      '.json', '.jsonc', '.json5',
      // CSS/Styles
      '.css', '.scss', '.sass', '.less',
      // HTML/Markup
      '.html', '.htm', '.xml', '.svg',
      // YAML
      '.yaml', '.yml',
      // Markdown
      '.md', '.mdx',
      // Shell
      '.sh', '.bash', '.zsh',
      // Other languages
      '.py', '.rb', '.go', '.rs', '.java', '.kt', '.php', '.c', '.cpp', '.h', '.hpp',
      // Config files
      '.env', '.toml', '.ini', '.cfg', '.conf'
    ])
    
    // Special files without extensions or with special names
    const specialFiles = new Set([
      'dockerfile', 'makefile', 'gnumakefile', 'cmakelists.txt',
      '.eslintrc', '.prettierrc', '.gitignore', '.dockerignore'
    ])
    
    async function walk(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          const lowerName = entry.name.toLowerCase()
          
          if (entry.isDirectory()) {
            if (!excludeDirs.includes(entry.name) && !entry.name.startsWith('.')) {
              await walk(fullPath)
            }
          } else if (entry.isFile()) {
            // Check if it's excluded
            const isExcluded = excludeFiles.some(exc => entry.name.endsWith(exc))
            if (isExcluded) continue
            
            // Check if it's a special file
            if (specialFiles.has(lowerName) || lowerName.startsWith('dockerfile.') || lowerName.endsWith('.dockerfile')) {
              files.push(fullPath)
              continue
            }
            
            // Check extensions
            const ext = path.extname(entry.name).toLowerCase()
            if (extensions.has(ext)) {
              files.push(fullPath)
            }
            
            // Also include .env.* files
            if (entry.name.startsWith('.env') || entry.name.startsWith('tsconfig') || entry.name.startsWith('.eslintrc') || entry.name.startsWith('.prettierrc')) {
              files.push(fullPath)
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
        console.warn(`Skipping directory ${dir}:`, error)
      }
    }
    
    await walk(rootPath)
    return files
  }
}