/** Editor contribution identities and targets; implementations remain frontend bindings. */
export interface TiptapPluginDeclaration {
  extensions?: Record<string, string>;
  popups?: Record<string, string>;
  isSuggestionActive?: string;
}

/** Frontend data shared by authored manifests, installed builds and native composition. */
export interface FrontendDeclaration {
  tiptapPlugins?: Record<string, TiptapPluginDeclaration>;
  appExtensions?: Record<string, string>;
}
