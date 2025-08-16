import type { editor } from 'monaco-editor'

export const defaultEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 14,
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  lineNumbers: 'on',
  renderLineHighlight: 'all',
  scrollbar: {
    vertical: 'auto',
    horizontal: 'auto',
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  theme: 'vs-dark',
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  lineHeight: 20,
  padding: { top: 12, bottom: 12 },
  suggest: {
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
  },
}

export const readOnlyEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  ...defaultEditorOptions,
  readOnly: true,
  domReadOnly: true,
  cursorStyle: 'line',
  renderValidationDecorations: 'on',
  selectionHighlight: false,
  occurrencesHighlight: 'off' as const,
  codeLens: false,
  contextmenu: false,
}

export const minimalEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  ...defaultEditorOptions,
  quickSuggestions: false,
  parameterHints: { enabled: false },
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: 'currentDocument',
  suggest: {
    ...defaultEditorOptions.suggest,
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
  },
}

export function createEditorKeybindings(
  monaco: any,
  onExecute?: () => void
): editor.IActionDescriptor[] {
  const keybindings: editor.IActionDescriptor[] = []
  
  if (onExecute) {
    keybindings.push({
      id: 'execute-code',
      label: 'Execute Code',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        monaco.KeyCode.F5,
      ],
      run: () => {
        onExecute()
      },
    })
  }
  
  return keybindings
}

export function setupJsonValidation(monaco: any) {
  monaco.languages.json?.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    schemas: [],
    allowComments: false,
    schemaValidation: 'error',
    enableSchemaRequest: false,
  })
}

export function setupJavaScriptValidation(monaco: any, functionBody = false) {
  const diagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  }
  
  monaco.languages.typescript?.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  monaco.languages.typescript?.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  
  const compilerOptions = {
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    reactNamespace: 'React',
    allowJs: true,
    checkJs: !functionBody, // Disable type checking in function body mode
  }
  
  monaco.languages.typescript?.typescriptDefaults.setCompilerOptions(compilerOptions)
  monaco.languages.typescript?.javascriptDefaults.setCompilerOptions(compilerOptions)
}

/**
 * Sets up function-body mode where code is treated as if it's inside a function
 * This allows top-level return statements and provides DSL type definitions
 */
export function setupFunctionBodyMode(monaco: any, language: 'javascript' | 'typescript' = 'typescript') {
  // Configure validation for function-body mode
  setupJavaScriptValidation(monaco, true)
  
  // Add type definitions for the DSL
  const dslTypes = `
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
      // Filter methods
      where(attribute: string, value?: any): QueryBuilder<T>;
      ofType(entityType: string): QueryBuilder<T>;
      withRole(role: string): QueryBuilder<T>;
      orderBy(attribute: string, direction?: 'asc' | 'desc'): QueryBuilder<T>;
      limit(count: number): QueryBuilder<T>;
      distinct(attribute: string): QueryBuilder<T>;
      reverse(): QueryBuilder<T>;
      groupBy(attribute: string): Map<string, QueryBuilder<T>>;
      
      // Relation methods
      linksTo(relationType: string, targetType: string | string[]): QueryBuilder<T>;
      linksFrom(relationType: string, sourceType: string | string[]): QueryBuilder<T>;
      
      // Pagination
      page(size: number, cursor?: string): { items: T[]; nextCursor?: string };
      
      // Terminal methods (projections)
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
  `;
  
  // Add the type definitions as an extra library
  if (language === 'typescript') {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      dslTypes,
      'dsl-types.d.ts'
    );
  } else {
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      dslTypes,
      'dsl-types.d.ts'
    );
  }
  
  // Wrap user code in a function context for validation
  // This is done virtually, not shown to the user
  monaco.languages.registerDocumentFormattingEditProvider(language, {
    provideDocumentFormattingEdits: () => null // Don't actually format
  });
}

export function getLanguageForFile(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  
  const languageMap: Record<string, string> = {
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
  
  return languageMap[ext] || 'plaintext'
}