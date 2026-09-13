// DSL types packs register for the host's code editors. Generated pack entries call
// registerDslType; editors read the registry through @abuddy/sdk/fe, so every pack
// registers into the host's copy.

export interface DslTypeConfig {
  prefix: string
  schema: string
  globals: Record<string, string>
  language?: 'javascript' | 'typescript' | 'json' | 'html' | 'css' | 'plaintext'
}

const dslRegistry = new Map<string, DslTypeConfig>()

export function registerDslType(name: string, config: DslTypeConfig): void {
  dslRegistry.set(name, config)
}

export function getDslTypes(): ReadonlyMap<string, DslTypeConfig> {
  return dslRegistry
}
