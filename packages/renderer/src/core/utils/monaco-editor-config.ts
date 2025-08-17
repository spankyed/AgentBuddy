import type { editor, languages } from 'monaco-editor'

type Monaco = typeof import('monaco-editor')
type Language = 'javascript' | 'typescript'
type DslType = 'database' | 'action' | 'prompt'

// Constants
const MONO_FONT_STACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

const SUGGEST_ALL_OFF: editor.ISuggestOptions = {
  showMethods: false,
  showFunctions: false,
  showConstructors: false,
  showFields: false,
  showVariables: false,
  showClasses: false,
  showStructs: false,
  showInterfaces: false,
  showModules: false,
  showProperties: false,
  showEvents: false,
  showOperators: false,
  showUnits: false,
  showValues: false,
  showConstants: false,
  showEnums: false,
  showEnumMembers: false,
  showKeywords: false,
  showWords: false,
  showColors: false,
  showFiles: false,
  showReferences: false,
  showFolders: false,
  showTypeParameters: false,
  showSnippets: false,
}

// Editor Presets
export const defaultEditorOptions: Readonly<editor.IStandaloneEditorConstructionOptions> = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 14,
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  theme: 'vs-dark',
  fontFamily: MONO_FONT_STACK,
  lineHeight: 20,
  padding: { top: 12, bottom: 12 },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
}

export const readOnlyEditorOptions: Readonly<editor.IStandaloneEditorConstructionOptions> = {
  ...defaultEditorOptions,
  readOnly: true,
  domReadOnly: true,
  selectionHighlight: false,
  occurrencesHighlight: 'off',
  codeLens: false,
  contextmenu: false,
}

export const minimalEditorOptions: Readonly<editor.IStandaloneEditorConstructionOptions> = {
  ...defaultEditorOptions,
  quickSuggestions: false,
  parameterHints: { enabled: false },
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: 'currentDocument',
  suggest: SUGGEST_ALL_OFF,
}

// Keybindings
export function createEditorKeybindings(
  monaco: Monaco,
  onExecute: () => void
): editor.IActionDescriptor[] {
  return [{
    id: 'execute-code',
    label: 'Execute Code',
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      monaco.KeyCode.F5,
    ],
    run: onExecute,
  }]
}

// Validation Setup
export function setupJsonValidation(monaco: Monaco): void {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    schemaValidation: 'error',
    enableSchemaRequest: false,
  })
}

export function setupJsTsValidation(monaco: Monaco, functionBody = false): void {
  const diagnosticsOptions: languages.typescript.DiagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  }

  const compilerOptions: languages.typescript.CompilerOptions = {
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowJs: true,
    checkJs: !functionBody,
  }

  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions)
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions)
}

// Import generated DSL types
import databaseDslTypes from '../types/database-dsl.d.ts?raw'
import actionDslTypes from '../types/action-dsl.d.ts?raw'
import promptDslTypes from '../types/prompt-dsl.d.ts?raw'

// DSL Type Definitions
const DSL_SCHEMAS: Record<DslType, string> = {
  database: databaseDslTypes,
  action: actionDslTypes,
  prompt: promptDslTypes,
}

// Track registered DSL libraries to prevent duplicates
const registeredLibs = new Set<string>()

export function setupFunctionBodyMode(
  monaco: Monaco,
  language: Language = 'typescript',
  dslType?: DslType
): void {
  setupJsTsValidation(monaco, true)
  
  if (dslType) {
    const libKey = `${language}-${dslType}`
    if (!registeredLibs.has(libKey)) {
      const libName = `dsl-${dslType}.d.ts`
      const langDefaults = language === 'typescript' 
        ? monaco.languages.typescript.typescriptDefaults
        : monaco.languages.typescript.javascriptDefaults
      
      langDefaults.addExtraLib(DSL_SCHEMAS[dslType], libName)
      registeredLibs.add(libKey)
    }
  }
  
  // Register no-op formatter to prevent virtual wrapper formatting
  monaco.languages.registerDocumentFormattingEditProvider(language, {
    provideDocumentFormattingEdits: () => null
  })
}

// File Extension Mapping
const EXTENSION_TO_LANGUAGE: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  sql: 'sql',
  py: 'python',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  php: 'php',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  sh: 'shell',
  bash: 'shell',
  ps1: 'powershell',
}

export function getLanguageForFile(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  return ext ? EXTENSION_TO_LANGUAGE[ext] || 'plaintext' : 'plaintext'
}