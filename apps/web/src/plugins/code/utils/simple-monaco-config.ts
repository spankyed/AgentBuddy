import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

let isInitialized = false
let projectFiles: Map<string, string> = new Map()

export async function initializeMonaco() {
  if (isInitialized) return
  
  // Configure Monaco workers
  self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new jsonWorker()
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
      if (label === 'typescript' || label === 'javascript') return new tsWorker()
      return new editorWorker()
    }
  }
  
  // Configure TypeScript defaults
  const compilerOptions: monaco.languages.typescript.CompilerOptions = {
    target: monaco.languages.typescript.ScriptTarget.Latest,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: false,
    strict: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    lib: ['es2020', 'dom'],
    noEmit: true,
    resolveJsonModule: true,
    skipLibCheck: true,
  }
  
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions)
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions)
  
  // Enable diagnostics
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  })
  
  // Add type definitions
  addBasicTypes()
  
  isInitialized = true
}

function addBasicTypes() {
  const domTypes = `
    declare var console: Console;
    declare var window: Window;
    declare var document: Document;
    
    interface Console {
      log(...args: any[]): void;
      error(...args: any[]): void;
      warn(...args: any[]): void;
      info(...args: any[]): void;
    }
  `
  
  monaco.languages.typescript.typescriptDefaults.addExtraLib(domTypes, 'ts:lib/dom.d.ts')
  monaco.languages.typescript.javascriptDefaults.addExtraLib(domTypes, 'ts:lib/dom.d.ts')
}

export async function loadProjectFiles(files: Array<{ path: string; content: string }>) {
  // Clear existing files
  projectFiles.clear()
  
  // Store files for reference
  files.forEach(file => {
    projectFiles.set(file.path, file.content)
  })
  
  // Add files as extra libs for TypeScript
  const tsFiles = files.filter(f => 
    f.path.endsWith('.ts') || 
    f.path.endsWith('.tsx') || 
    f.path.endsWith('.d.ts')
  )
  
  // Clear existing extra libs
  monaco.languages.typescript.typescriptDefaults.setExtraLibs([])
  
  // Add project files as extra libs
  tsFiles.forEach(file => {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      file.content,
      `file:///${file.path}`
    )
  })
}

export function createEditor(
  container: HTMLElement,
  value: string,
  language: string,
  options?: monaco.editor.IStandaloneEditorConstructionOptions
): monaco.editor.IStandaloneCodeEditor {
  const defaultOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    value,
    language,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    folding: true,
    bracketPairColorization: { enabled: true },
    formatOnPaste: true,
    formatOnType: true,
    quickSuggestions: {
      other: true,
      comments: true,
      strings: true
    },
    parameterHints: { enabled: true },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'on',
    snippetSuggestions: 'inline',
  }
  
  return monaco.editor.create(container, {
    ...defaultOptions,
    ...options
  })
}

export function getLanguageId(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  
  const languageMap: Record<string, string> = {
    // TypeScript/JavaScript
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    // Web
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    // Data
    json: 'json',
    jsonc: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    // Programming
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    // Shell
    sh: 'shell',
    bash: 'shell',
    ps1: 'powershell',
    // Markup
    md: 'markdown',
    // SQL
    sql: 'sql',
  }
  
  return languageMap[ext] || 'plaintext'
}