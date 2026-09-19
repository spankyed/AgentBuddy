// DSL types packs contribute for the host's code editors: a pack's frontend registration carries them
// (`PackFERegistration.dslTypes`, which generate-entries writes), and editors read the renderer's registry here.
import { boundFeHost } from '../runtime/fe-host.ts'

export interface DslTypeConfig {
  prefix: string
  schema: string
  globals: Record<string, string>
  language?: 'javascript' | 'typescript' | 'json' | 'html' | 'css' | 'plaintext'
}

export function getDslTypes(): ReadonlyMap<string, DslTypeConfig> {
  return boundFeHost().packs.dslTypes()
}
