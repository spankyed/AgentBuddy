/** The flow compiler's lookup context */

export interface CompilerContext {
  actions: Map<string, string>;
  prompts: Map<string, string>;
  flows: Map<string, string>;
}
