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

export function setupJavaScriptValidation(monaco: any) {
  const diagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  }
  
  monaco.languages.typescript?.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  monaco.languages.typescript?.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  
  monaco.languages.typescript?.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    reactNamespace: 'React',
    allowJs: true,
    checkJs: true,
  })
  
  monaco.languages.typescript?.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    reactNamespace: 'React',
    allowJs: true,
    checkJs: true,
  })
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