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

// DSL Type Definitions
const DSL_SCHEMAS: Record<DslType, string> = {
  database: `
    declare namespace EARS {
      export namespace Entity {
        export const Thread: string;
        export const Message: string;
        export const Tag: string;
        export const User: string;
        export const Agent: string;
        export const Flow: string;
        export const Prompt: string;
        export const Action: string;
      }
    }
    
    interface QueryBuilder<T = any> {
      where(attribute: string, value?: any): QueryBuilder<T>;
      ofType(entityType: string): QueryBuilder<T>;
      withRole(role: string): QueryBuilder<T>;
      orderBy(attribute: string, direction?: 'asc' | 'desc'): QueryBuilder<T>;
      limit(count: number): QueryBuilder<T>;
      distinct(attribute: string): QueryBuilder<T>;
      reverse(): QueryBuilder<T>;
      groupBy(attribute: string): Map<string, QueryBuilder<T>>;
      linksTo(relationType: string, targetType: string | string[]): QueryBuilder<T>;
      linksFrom(relationType: string, sourceType: string | string[]): QueryBuilder<T>;
      page(size: number, cursor?: string): { items: T[]; nextCursor?: string };
      pick(attributes: string[]): T[];
      pickAll(): T[];
      pickOne(attributes?: string[]): T | null;
      ids(): string[];
      count(): number;
    }
    
    declare function qx(entityIdOrType?: string): QueryBuilder;
    declare function getAll(entityId: string): Record<string, any>;
    declare function getSchemaStats(): {
      entities: Record<string, number>;
      attributes: Record<string, number>;
      relations: Record<string, number>;
    };
  `,
  
  action: `
    declare const params: Record<string, any>;
    
    declare const services: {
      logger: {
        info(message: string, data?: any): Promise<void>;
        warn(message: string, data?: any): Promise<void>;
        error(message: string, data?: any): Promise<void>;
        debug(message: string, data?: any): Promise<void>;
      };
      llm: {
        chat(messages: any[], options?: any): Promise<string>;
        complete(prompt: string, options?: any): Promise<string>;
      };
      database: {
        query(sql: string, params?: any[]): Promise<any>;
        execute(sql: string, params?: any[]): Promise<any>;
      };
      prompt: {
        get(label: string): any;
        execute(label: string, params: Record<string, any>): string;
      };
      action: {
        execute(label: string, params: Record<string, any>): Promise<any>;
      };
      library: {
        search(query: string): Promise<any[]>;
        get(id: string): any;
      };
      browser: {
        open(url: string): Promise<void>;
        screenshot(url: string): Promise<string>;
      };
      repository: {
        get(key: string): any;
        set(key: string, value: any): void;
      };
    };
    
    declare const z: {
      string(): any;
      number(): any;
      boolean(): any;
      object(shape: any): any;
      array(schema: any): any;
      optional(): any;
      nullable(): any;
      union(schemas: any[]): any;
      enum(values: string[]): any;
      literal(value: any): any;
    };
  `,
  
  prompt: `
    declare const params: Record<string, any>;
    declare function usePrompt(label: string, params: Record<string, any>): string | undefined;
  `,
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