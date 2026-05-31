/**
 * Centralized Monaco Editor Configuration
 * Single source of truth for all Monaco-related configuration
 */

import type { editor, IDisposable } from 'monaco-editor'

type Monaco = typeof import('monaco-editor')
type Language = 'javascript' | 'typescript' | 'json' | 'html' | 'css' | 'plaintext'
type DslType = 'database' | 'action' | 'prompt'
type EditorPreset = 'default' | 'readonly' | 'minimal' | 'dsl' | 'codeEditor'

// ============================================================================
// CONSTANTS
// ============================================================================

const MONO_FONT_STACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

// Language file extension mapping
const LANGUAGE_MAP: Record<string, string> = {
  // TypeScript/JavaScript
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  // Vue
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

// DSL type imports
import databaseDslTypes from '../types/generated/database-defs.d.ts?raw'
import actionDslTypes from '../types/generated/action-defs.d.ts?raw'
import promptDslTypes from '../types/generated/prompt-defs.d.ts?raw'

const DSL_SCHEMAS: Record<DslType, string> = {
  database: databaseDslTypes,
  action: actionDslTypes,
  prompt: promptDslTypes,
}

// ============================================================================
// EDITOR OPTION PRESETS
// ============================================================================

const baseEditorOptions: editor.IStandaloneEditorConstructionOptions = {
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
  fixedOverflowWidgets: true,
}

// Suggest options with all features disabled
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

// Suggest options with all features enabled
const SUGGEST_ALL_ON: editor.ISuggestOptions = {
  snippetsPreventQuickSuggestions: false,
  showMethods: true,
  showFunctions: true,
  showConstructors: true,
  showFields: true,
  showVariables: true,
  showClasses: true,
  showStructs: true,
  showInterfaces: true,
  showModules: true,
  showProperties: true,
  showEvents: true,
  showOperators: true,
  showUnits: true,
  showValues: true,
  showConstants: true,
  showEnums: true,
  showEnumMembers: true,
  showKeywords: true,
  showWords: true,
  showColors: true,
  showFiles: true,
  showReferences: true,
  showFolders: true,
  showTypeParameters: true,
  showSnippets: true,
}

/**
 * Editor option presets for different use cases
 */
export const editorPresets: Record<EditorPreset, Readonly<editor.IStandaloneEditorConstructionOptions>> = {
  // Default preset with standard features
  default: {
    ...baseEditorOptions,
  },
  
  // Read-only preset
  readonly: {
    ...baseEditorOptions,
    readOnly: true,
    domReadOnly: true,
    selectionHighlight: false,
    occurrencesHighlight: 'off',
    codeLens: false,
    contextmenu: false,
  },
  
  // Minimal preset with no suggestions
  minimal: {
    ...baseEditorOptions,
    quickSuggestions: false,
    parameterHints: { enabled: false },
    suggestOnTriggerCharacters: false,
    wordBasedSuggestions: 'currentDocument',
    suggest: SUGGEST_ALL_OFF,
  },
  
  // DSL preset with full intellisense
  dsl: {
    ...baseEditorOptions,
    quickSuggestions: {
      other: true,
      comments: false,
      strings: true
    },
    parameterHints: { enabled: true },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnCommitCharacter: true,
    tabCompletion: 'on',
    wordBasedSuggestions: 'allDocuments',
    suggest: SUGGEST_ALL_ON,
  },
  
  // Code editor preset for regular code files
  codeEditor: {
    ...baseEditorOptions,
    quickSuggestions: false,
    parameterHints: { enabled: false },
    suggestOnTriggerCharacters: false,
    wordBasedSuggestions: 'currentDocument',
  },
}

// ============================================================================
// INITIALIZATION STATE
// ============================================================================

let monacoInitialized = false
const registeredDslLibs = new Set<string>()
const initializedLanguages = new Set<string>()
// Keyed by language alone (not dslType) — the no-op formatter body below is
// identical across DSL types, so one registration per language suffices.
const registeredFormatters = new Set<string>()

// ============================================================================
// FILE TYPE DETECTION
// ============================================================================

/**
 * Get language ID from file path
 */
export function getLanguageFromPath(filePath: string): string {
  // Check for DSL files
  if (filePath.startsWith('action:') || filePath.startsWith('prompt:')) {
    return 'typescript'
  }
  if (filePath.startsWith('database:')) {
    return 'typescript'
  }
  
  // Handle diff file paths (e.g., "diff:path/to/file.ts:staged")
  if (filePath.startsWith('diff:')) {
    const parts = filePath.split(':')
    if (parts.length >= 2) {
      const actualPath = parts.slice(1, -1).join(':')
      const ext = actualPath.split('.').pop()?.toLowerCase() || ''
      return LANGUAGE_MAP[ext] || 'plaintext'
    }
  }
  
  // Regular file extension mapping
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return LANGUAGE_MAP[ext] || 'plaintext'
}

/**
 * Get DSL type from file path
 */
export function getDslTypeFromPath(filePath: string): DslType | null {
  if (filePath.startsWith('action:')) return 'action'
  if (filePath.startsWith('prompt:')) return 'prompt'
  if (filePath.startsWith('database:')) return 'database'
  return null
}

/**
 * Check if a file path represents a DSL file
 */
export function isDslFile(filePath: string): boolean {
  return getDslTypeFromPath(filePath) !== null
}

/**
 * Get appropriate editor preset for a file
 */
export function getEditorPresetForFile(filePath: string, readOnly = false): EditorPreset {
  if (readOnly) return 'readonly'
  if (isDslFile(filePath)) return 'dsl'
  return 'codeEditor'
}

// ============================================================================
// DSL SETUP
// ============================================================================

/**
 * Setup DSL modules for Monaco Editor
 */
function setupDslModules(monaco: Monaco, dslType: DslType, language: Language = 'typescript'): void {
  const libKey = `${language}-${dslType}-module`
  
  if (registeredDslLibs.has(libKey)) {
    return // Already registered
  }
  
  const langDefaults = language === 'typescript' 
    ? monaco.typescript.typescriptDefaults
    : monaco.typescript.javascriptDefaults
  
  // Add the module as a virtual file
  const moduleUri = `inmemory:///node_modules/@app/defs/${dslType}/index.d.ts`
  langDefaults.addExtraLib(DSL_SCHEMAS[dslType], moduleUri)
  
  registeredDslLibs.add(libKey)
}

/**
 * Setup global DSL declarations for function body mode
 */
function setupDslGlobals(monaco: Monaco, dslType: DslType, language: Language = 'typescript'): void {
  const libKey = `${language}-${dslType}-globals`
  
  if (registeredDslLibs.has(libKey)) {
    return // Already registered
  }
  
  const langDefaults = language === 'typescript' 
    ? monaco.typescript.typescriptDefaults
    : monaco.typescript.javascriptDefaults
  
  // Create wrapper that imports from the module and makes things available globally
  const wrapperContent = `
    import * as _dsl from '@app/defs/${dslType}';
    
    // Make DSL exports available globally for function body
    ${dslType === 'action' ? `
    declare global {
      const services: typeof _dsl.services;
      const z: typeof _dsl.z;
    }` : ''}
    ${dslType === 'prompt' ? `
    declare global {
      const usePrompt: typeof _dsl.usePrompt;
    }` : ''}
    ${dslType === 'database' ? `
    declare global {
      const EARS: typeof _dsl.EARS;
      const qx: typeof _dsl.qx;
      const tx: typeof _dsl.tx;
      const bp: typeof _dsl.bp;
      const spawn: typeof _dsl.spawn;
      const getSchemaStats: typeof _dsl.getSchemaStats;
      const isEntity: typeof _dsl.isEntity;
    }` : ''}
  `
  
  langDefaults.addExtraLib(wrapperContent, `inmemory:///dsl-wrapper-${dslType}.d.ts`)
  registeredDslLibs.add(libKey)
}

// ============================================================================
// DYNAMIC PARAMS TYPE
// ============================================================================

const PARAM_TYPE_MAP: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  object: 'Record<string, any>',
  array: 'any[]',
  any: 'any',
}

function generateParamsTypeDeclaration(
  params: Record<string, { type: string }>
): string {
  const entries = Object.entries(params)
  if (entries.length === 0) {
    return 'declare const params: Record<string, any>;'
  }
  const fields = entries
    .map(([key, val]) => `    ${key}: ${PARAM_TYPE_MAP[val.type] || val.type};`)
    .join('\n')
  return `declare const params: {\n${fields}\n    [key: string]: any;\n};`
}

let paramsTypeDisposable: IDisposable | null = null

export function updateDslParamsType(
  monaco: Monaco,
  dslType: 'action' | 'prompt',
  params: Record<string, { type: string }>,
  language: Language = 'typescript'
): void {
  if (paramsTypeDisposable) {
    paramsTypeDisposable.dispose()
    paramsTypeDisposable = null
  }
  const declaration = generateParamsTypeDeclaration(params)
  const langDefaults = language === 'typescript'
    ? monaco.typescript.typescriptDefaults
    : monaco.typescript.javascriptDefaults
  paramsTypeDisposable = langDefaults.addExtraLib(declaration, 'inmemory:///dsl-params-override.d.ts')
}

export function clearDslParamsType(monaco: Monaco, language: Language = 'typescript'): void {
  if (paramsTypeDisposable) {
    paramsTypeDisposable.dispose()
    paramsTypeDisposable = null
  }
  const fallback = 'declare const params: Record<string, any>;'
  const langDefaults = language === 'typescript'
    ? monaco.typescript.typescriptDefaults
    : monaco.typescript.javascriptDefaults
  paramsTypeDisposable = langDefaults.addExtraLib(fallback, 'inmemory:///dsl-params-override.d.ts')
}

// ============================================================================
// LANGUAGE CONFIGURATION
// ============================================================================

/**
 * Setup TypeScript/JavaScript language defaults
 */
function setupTypeScriptDefaults(
  monaco: Monaco,
  options: {
    enableTypeChecking?: boolean
    enableSuggestions?: boolean
    functionBodyMode?: boolean
  } = {}
): void {
  const {
    enableTypeChecking = false,
    enableSuggestions = false,
    functionBodyMode = false
  } = options
  
  const diagnosticsOptions = {
    noSemanticValidation: !enableTypeChecking,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: !enableSuggestions
  }
  
  const compilerOptions = {
    target: monaco.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    module: functionBodyMode 
      ? monaco.typescript.ModuleKind.ESNext
      : monaco.typescript.ModuleKind.CommonJS,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.typescript.JsxEmit.React,
    allowJs: true,
    checkJs: !functionBodyMode && enableTypeChecking,
    strict: enableTypeChecking,
    skipLibCheck: true
  }
  
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  monaco.typescript.typescriptDefaults.setCompilerOptions(compilerOptions)
  monaco.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  monaco.typescript.javascriptDefaults.setCompilerOptions(compilerOptions)
}

/**
 * Setup JSON language defaults
 */
function setupJsonDefaults(monaco: Monaco): void {
  monaco.json?.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    schemas: [],
    allowComments: false,
    enableSchemaRequest: false
  })
}

/**
 * Setup HTML language defaults
 */
function setupHtmlDefaults(monaco: Monaco): void {
  monaco.html?.htmlDefaults.setOptions({
    format: {
      tabSize: 2,
      insertSpaces: true,
      wrapLineLength: 120,
      unformatted: '',
      contentUnformatted: 'pre,code,textarea',
      indentInnerHtml: false,
      preserveNewLines: true,
      maxPreserveNewLines: 2,
      indentHandlebars: false,
      endWithNewline: false,
      extraLiners: 'head, body, /html',
      wrapAttributes: 'auto'
    },
    suggest: {
      html5: true
    }
  })
}

/**
 * Setup CSS language defaults
 */
function setupCssDefaults(monaco: Monaco): void {
  monaco.css?.cssDefaults.setOptions({
    validate: true,
    lint: {
      compatibleVendorPrefixes: 'warning',
      vendorPrefix: 'warning',
      duplicateProperties: 'error',
      emptyRules: 'warning',
      importStatement: 'ignore',
      boxModel: 'ignore',
      universalSelector: 'ignore',
      zeroUnits: 'warning',
      fontFaceProperties: 'warning',
      hexColorLength: 'warning',
      argumentsInColorFunction: 'error',
      unknownProperties: 'warning',
      ieHack: 'ignore',
      unknownVendorSpecificProperties: 'ignore',
      propertyIgnoredDueToDisplay: 'warning',
      important: 'ignore',
      float: 'ignore',
      idSelector: 'ignore'
    }
  })
}

// ============================================================================
// MAIN INITIALIZATION
// ============================================================================

export interface InitializeMonacoOptions {
  enableTypeChecking?: boolean
  enableSuggestions?: boolean
  setupLanguages?: boolean
}

/**
 * Initialize Monaco editor with base configuration
 */
export function initializeMonaco(options: InitializeMonacoOptions = {}): void {
  if (monacoInitialized) return
  
  const monaco = (window as any).monaco as Monaco
  if (!monaco) return
  
  monacoInitialized = true
  
  const {
    enableTypeChecking = false,
    enableSuggestions = false,
    setupLanguages = true
  } = options
  
  // Setup language defaults
  if (setupLanguages) {
    setupTypeScriptDefaults(monaco, {
      enableTypeChecking,
      enableSuggestions,
      functionBodyMode: false
    })
    setupJsonDefaults(monaco)
    setupHtmlDefaults(monaco)
    setupCssDefaults(monaco)
  }
}

/**
 * Setup Monaco for a specific file
 */
export interface SetupFileOptions {
  filePath: string
  language?: string
  isDsl?: boolean
  enableTypeChecking?: boolean
  enableSuggestions?: boolean
}

export function setupMonacoForFile(
  monaco: Monaco,
  options: SetupFileOptions
): void {
  const {
    filePath,
    language = getLanguageFromPath(filePath),
    isDsl = isDslFile(filePath),
    enableTypeChecking = isDsl,
    enableSuggestions = isDsl
  } = options
  
  // Initialize base Monaco if needed
  if (!monacoInitialized) {
    initializeMonaco({
      enableTypeChecking: false,
      enableSuggestions: false
    })
  }
  
  // Setup DSL if needed
  if (isDsl) {
    const dslType = getDslTypeFromPath(filePath)
    if (dslType && (language === 'typescript' || language === 'javascript')) {
      setupFunctionBodyMode(monaco, language as 'typescript' | 'javascript', dslType)
    }
  }
  
  // Configure TypeScript for this file type
  if (language === 'typescript' || language === 'javascript') {
    const langKey = `${language}-${isDsl ? 'dsl' : 'regular'}`
    if (!initializedLanguages.has(langKey)) {
      setupTypeScriptDefaults(monaco, {
        enableTypeChecking,
        enableSuggestions,
        functionBodyMode: isDsl
      })
      initializedLanguages.add(langKey)
    }
  }
}

/**
 * Setup function body mode for DSL files
 */
export function setupFunctionBodyMode(
  monaco: Monaco,
  language: 'typescript' | 'javascript' = 'typescript',
  dslType: DslType
): void {
  // Setup TypeScript for function body mode
  setupTypeScriptDefaults(monaco, {
    enableTypeChecking: true,
    enableSuggestions: true,
    functionBodyMode: true
  })
  
  // Setup DSL modules and globals
  setupDslModules(monaco, dslType, language)
  setupDslGlobals(monaco, dslType, language)

  // Register generic params fallback (will be overridden by updateDslParamsType)
  clearDslParamsType(monaco, language)

  // Register no-op formatter to prevent virtual wrapper formatting.
  // Guarded so repeated mounts don't stack identical providers on the
  // global language registry (each registration attaches listeners).
  if (!registeredFormatters.has(language)) {
    monaco.languages.registerDocumentFormattingEditProvider(language, {
      provideDocumentFormattingEdits: () => null
    })
    registeredFormatters.add(language)
  }
}

// ============================================================================
// EDITOR ACTIONS
// ============================================================================

import { createInsertConsoleLogAction } from './monaco-actions'

export type EditorAction = 'executeCode' | 'insertConsoleLog'

export interface EditorActionOptions {
  executeKeybinding?: {
    key: string
    modifiers: string[]
  }
}

/**
 * Create editor actions based on requested action types
 */
export function createEditorActions(
  monaco: Monaco,
  actions?: EditorAction[],
  callbacks?: {
    onExecute?: () => void
  },
  options?: EditorActionOptions
): editor.IActionDescriptor[] {
  if (!actions || actions.length === 0) return []
  
  const actionDescriptors: editor.IActionDescriptor[] = []
  
  for (const action of actions) {
    switch (action) {
      case 'executeCode':
        if (callbacks?.onExecute) {
          const keybindings = options?.executeKeybinding 
            ? [convertKeybindingToMonaco(monaco, options.executeKeybinding), monaco.KeyCode.F5]
            : [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, monaco.KeyCode.F5]
          
          actionDescriptors.push({
            id: 'execute-code',
            label: 'Execute Code',
            keybindings,
            run: callbacks.onExecute,
          })
        }
        break
        
      case 'insertConsoleLog':
        actionDescriptors.push(createInsertConsoleLogAction(monaco))
        break
    }
  }
  
  return actionDescriptors
}

/**
 * Create standard editor keybindings (deprecated - use createEditorActions)
 * @deprecated Use createEditorActions instead
 */
export function createEditorKeybindings(
  monaco: Monaco,
  onExecute?: () => void
): editor.IActionDescriptor[] {
  return createEditorActions(monaco, ['executeCode'], { onExecute })
}

/**
 * Convert a keybinding object to Monaco KeyCode
 */
function convertKeybindingToMonaco(
  monaco: Monaco,
  keybinding: { key: string; modifiers: string[] }
): number {
  let result = 0
  
  // Add modifiers
  for (const modifier of keybinding.modifiers) {
    switch (modifier.toLowerCase()) {
      case 'cmd':
      case 'meta':
      case 'command':
        result |= monaco.KeyMod.CtrlCmd
        break
      case 'ctrl':
      case 'control':
        result |= monaco.KeyMod.CtrlCmd
        break
      case 'alt':
      case 'option':
        result |= monaco.KeyMod.Alt
        break
      case 'shift':
        result |= monaco.KeyMod.Shift
        break
    }
  }
  
  // Add key
  const keyMap: Record<string, number> = {
    'Enter': monaco.KeyCode.Enter,
    'Space': monaco.KeyCode.Space,
    'Tab': monaco.KeyCode.Tab,
    'Escape': monaco.KeyCode.Escape,
    'ArrowUp': monaco.KeyCode.UpArrow,
    'ArrowDown': monaco.KeyCode.DownArrow,
    'ArrowLeft': monaco.KeyCode.LeftArrow,
    'ArrowRight': monaco.KeyCode.RightArrow,
    'F1': monaco.KeyCode.F1,
    'F2': monaco.KeyCode.F2,
    'F3': monaco.KeyCode.F3,
    'F4': monaco.KeyCode.F4,
    'F5': monaco.KeyCode.F5,
    'F6': monaco.KeyCode.F6,
    'F7': monaco.KeyCode.F7,
    'F8': monaco.KeyCode.F8,
    'F9': monaco.KeyCode.F9,
    'F10': monaco.KeyCode.F10,
    'F11': monaco.KeyCode.F11,
    'F12': monaco.KeyCode.F12,
  }
  
  if (keyMap[keybinding.key]) {
    result |= keyMap[keybinding.key]
  } else if (keybinding.key.length === 1) {
    // Single character keys
    const keyCode = `Key${keybinding.key.toUpperCase()}` as keyof typeof monaco.KeyCode
    if (monaco.KeyCode[keyCode]) {
      result |= monaco.KeyCode[keyCode]
    }
  }
  
  return result
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Reset all Monaco registrations (useful for testing)
 */
export function resetMonacoState(): void {
  monacoInitialized = false
  registeredDslLibs.clear()
  initializedLanguages.clear()
}

/**
 * Get current Monaco initialization state
 */
export function getMonacoState(): {
  initialized: boolean
  registeredDsls: string[]
  initializedLanguages: string[]
} {
  return {
    initialized: monacoInitialized,
    registeredDsls: Array.from(registeredDslLibs),
    initializedLanguages: Array.from(initializedLanguages)
  }
}