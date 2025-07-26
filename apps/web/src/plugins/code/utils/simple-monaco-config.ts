import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

let isInitialized = false

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
  
  // Disable all TypeScript/JavaScript validation
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true
  })
  
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true
  })
  
  // Minimal compiler options just for basic parsing
  const minimalCompilerOptions: monaco.languages.typescript.CompilerOptions = {
    allowNonTsExtensions: true,
    allowJs: true,
    target: monaco.languages.typescript.ScriptTarget.Latest,
  }
  
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(minimalCompilerOptions)
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(minimalCompilerOptions)
  
  isInitialized = true
}

// Removed all type definitions and project file loading

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
    // Disable most IntelliSense features
    quickSuggestions: false,
    parameterHints: { enabled: false },
    suggestOnTriggerCharacters: false,
    acceptSuggestionOnCommitCharacter: false,
    acceptSuggestionOnEnter: 'off',
    snippetSuggestions: 'none',
    wordBasedSuggestions: 'currentDocument' as const, // Keep basic word completion
  }
  
  return monaco.editor.create(container, {
    ...defaultOptions,
    ...options
  })
}

export function getLanguageId(filePath: string): string {
  // Check if this is an action file
  if (filePath.startsWith('action:')) {
    return 'typescript'
  }
  
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  
  const languageMap: Record<string, string> = {
    // TypeScript/JavaScript
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    // Vue - using HTML for basic highlighting
    vue: 'html',
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