export interface LanguageServerConfig {
  id: string
  command: string
  args?: string[]
  languages: string[]
  initializationOptions?: Record<string, unknown>
  transport: 'stdio'
}

export const languageServerRegistry: LanguageServerConfig[] = [
  {
    id: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    transport: 'stdio',
  },
]

export function findConfigForLanguage(languageId: string): LanguageServerConfig | undefined {
  return languageServerRegistry.find(config => config.languages.includes(languageId))
}
