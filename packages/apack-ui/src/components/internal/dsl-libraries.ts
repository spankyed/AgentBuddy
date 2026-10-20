import type { IDisposable } from 'monaco-editor';
import { getDslDeclaration, onDslDeclarationsChanged } from '@apackdev/sdk/fe';

type Monaco = typeof import('monaco-editor');
type Language = 'typescript' | 'javascript';
interface Library {
  type: string;
  language: Language;
  users: number;
  text: readonly string[];
  disposables: IDisposable[];
}
interface Owner {
  libraries: Map<string, Library>;
  stop: () => void;
}
const owners = new Map<Monaco, Owner>();

function dispose(library: Library): void {
  for (const disposable of library.disposables) disposable.dispose();
  library.disposables = []; library.text = [];
}

function refresh(monaco: Monaco, library: Library): void {
  const entry = getDslDeclaration(library.type);
  const globals = entry?.declaration.globals ?? {};
  const text = entry?.declaration.targets.includes('monaco') && entry.definitions !== undefined
    ? [entry.definitions, ...(Object.keys(globals).length ? [
      `import * as _dsl from '@app/defs/${library.type}';\ndeclare global {\n${Object.entries(globals).map(([name, type]) => `  const ${name}: ${type};`).join('\n')}\n}`,
    ] : [])] : [];
  if (text.length === library.text.length && text.every((value, index) => value === library.text[index])) return;
  dispose(library);
  const defaults = library.language === 'typescript' ? monaco.typescript.typescriptDefaults : monaco.typescript.javascriptDefaults;
  const paths = [`inmemory:///node_modules/@app/defs/${library.type}/index.d.ts`, `inmemory:///dsl-wrapper-${library.type}.d.ts`];
  try {
    for (const [index, content] of text.entries()) library.disposables.push(defaults.addExtraLib(content, paths[index]));
    library.text = text;
  } catch (error) { dispose(library); throw error; }
}

/** Editors share a library until the last consumer releases it; publications replace its owned handles. */
export function acquireDslLibraries(monaco: Monaco, type: string, language: Language): () => void {
  let owner = owners.get(monaco);
  if (!owner) {
    const created: Owner = { libraries: new Map(), stop: () => {} };
    created.stop = onDslDeclarationsChanged(() => { for (const library of created.libraries.values()) refresh(monaco, library); });
    owners.set(monaco, created); owner = created;
  }
  const key = `${language}:${type}`;
  let library = owner.libraries.get(key);
  if (!library) {
    library = { type, language, users: 0, text: [], disposables: [] };
    owner.libraries.set(key, library);
  }
  library.users++;
  let released = false;
  const release = () => {
    if (released) return; released = true;
    if (owner.libraries.get(key) !== library || --library.users) return;
    dispose(library); owner.libraries.delete(key);
    if (!owner.libraries.size) { owner.stop(); owners.delete(monaco); }
  };
  try { refresh(monaco, library); } catch (error) { release(); throw error; }
  return release;
}

export function disposeDslLibraries(): void {
  for (const owner of owners.values()) {
    for (const library of owner.libraries.values()) dispose(library);
    owner.libraries.clear(); owner.stop();
  }
  owners.clear();
}

export function registeredDslLibraries(): string[] {
  return [...owners.values()].flatMap(owner => [...owner.libraries.values()].flatMap(library =>
    library.text.map((_, index) => `${library.language}-${library.type}-${index ? 'globals' : 'module'}`)));
}
