import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type * as TS from 'typescript';

/** What a module exports under a name, as the TypeScript compiler resolves it */
export interface ExportInfo {
  /** The runtime value's kind; undefined when the name exports only a type (or a value through `export type`) */
  value?: 'object' | 'function' | 'class';
  /** Whether the name can be used as a type */
  type: boolean;
}

export interface ModuleExports {
  /** The export `name` of `file` (an absolute path the reader was created with); undefined when it has none */
  exportOf(file: string, name: string): ExportInfo | undefined;
  /**
   * The `type` literals of the events a system module's default export (its `SystemEntry`) declares it sends:
   * its spec's outgoing union, so `{ type: 'A' } | { type: 'B' }` reads as `['A', 'B']`. Throws when the entry's
   * spec has lost that union (an entry annotated `: SystemEntry` rather than declared with `satisfies`), or when a
   * member has no literal `type` (a union widened to `string`, or a shape that isn't an event), because a map built
   * from it would be silently short and the check over it would reject real events.
   */
  outgoingEventTypesOf(file: string): string[];
  /**
   * The `type` literals of the events a plugin module's `accepts` export (its `pluginAccepts()` call) declares
   * that *other* plugins may send it. A plugin with no `accepts` export reads as `[]`: what its own feature's
   * system sends it is that system's outgoing union, which codegen adds. Throws on a member with no literal
   * `type`, as the system reader does, and when an `accepts` export carries no events — an annotation
   * (`: PluginAccepts`) drops them, and an inbox declared as nothing is a mistake rather than a contract.
   */
  acceptedEventTypesOf(file: string): string[];
}

/**
 * The `code` of the error codegen throws when a system's types don't resolve, which a pack whose dependencies
 * aren't installed yet gets: the CLI tells that apart from a mistake in the pack.
 *
 * @internal Host-only: abuddy CLI build tooling.
 */
export const _TYPES_UNRESOLVED = 'ABUDDY_TYPES_UNRESOLVED';

function loadTypeScript(): typeof TS {
  try {
    return createRequire(import.meta.url)('typescript') as typeof TS;
  } catch (err) {
    if ((err as { code?: string }).code !== 'MODULE_NOT_FOUND') throw err;
    throw new Error('Generating pack entries reads module exports with the TypeScript compiler, and "typescript" is not installed. Install it next to @abuddy/sdk (npm install --save-dev typescript).');
  }
}

function compilerOptions(ts: typeof TS, packRoot: string): TS.CompilerOptions {
  const configPath = path.join(packRoot, 'tsconfig.json');
  if (!fs.existsSync(configPath)) {
    return { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true };
  }
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(`${configPath}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    },
  });
  if (!parsed) throw new Error(`${configPath} could not be read`);
  return parsed.options;
}

/**
 * Reads the exports of a pack's modules with one TypeScript program over `files` (and what they
 * import), under the pack's tsconfig and the conditions its code builds with. Re-exports, barrels
 * and `export type` resolve as the compiler resolves them.
 *
 * @internal Host-only: abuddy CLI build tooling.
 */
export function createModuleExports(packRoot: string, files: string[]): ModuleExports {
  const ts = loadTypeScript();
  const program = ts.createProgram({
    rootNames: files,
    // No ambient type packages (`types`): exports don't depend on them, and loading them is most of the program's cost
    options: { ...compilerOptions(ts, packRoot), types: [], noEmit: true },
  });
  const checker = program.getTypeChecker();

  /** The type of the value exported under `name`, following aliases, or undefined when there is none */
  function exportedValueType(file: string, name: string): TS.Type | undefined {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) throw new Error(`${file} is not part of the program reading pack exports`);
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    const exported = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === name);
    if (!exported) return undefined;
    let symbol = exported;
    while (symbol.flags & ts.SymbolFlags.Alias) {
      const target = checker.getImmediateAliasedSymbol(symbol);
      if (!target) return undefined;
      symbol = target;
    }
    return symbol.flags & ts.SymbolFlags.Value ? checker.getTypeOfSymbol(symbol) : undefined;
  }

  /** The type of property `name` of `type`, or undefined when it has none */
  function propertyType(type: TS.Type, name: string): TS.Type | undefined {
    const property = type.getProperty(name);
    const declaration = property && (property.valueDeclaration ?? property.declarations?.[0]);
    return property && (declaration ? checker.getTypeOfSymbolAtLocation(property, declaration) : checker.getTypeOfSymbol(property));
  }

  return {
    exportOf(file, name) {
      const sourceFile = program.getSourceFile(file);
      if (!sourceFile) throw new Error(`${file} is not part of the program reading pack exports`);
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
      const exported = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === name);
      if (!exported) return undefined;

      // Follow `export { x } from` and `import`/`export` chains, noting a type-only link on the way
      let symbol = exported;
      let typeOnly = false;
      while (symbol.flags & ts.SymbolFlags.Alias) {
        if (symbol.declarations?.some((declaration) => ts.isTypeOnlyImportOrExportDeclaration(declaration))) typeOnly = true;
        const target = checker.getImmediateAliasedSymbol(symbol);
        // An alias to a module the program can't resolve
        if (!target) return undefined;
        symbol = target;
      }

      const type = (symbol.flags & ts.SymbolFlags.Type) !== 0;
      if (typeOnly || !(symbol.flags & ts.SymbolFlags.Value)) return { type };
      if (symbol.flags & ts.SymbolFlags.Class) return { value: 'class', type };
      const callable = symbol.flags & ts.SymbolFlags.Function || checker.getTypeOfSymbol(symbol).getCallSignatures().length > 0;
      return { value: callable ? 'function' : 'object', type };
    },

    outgoingEventTypesOf(file) {
      const entry = exportedValueType(file, 'default');
      const spec = entry && !(entry.flags & ts.TypeFlags.Any) ? propertyType(entry, 'spec') : entry;
      if (spec && spec.flags & ts.TypeFlags.Any) {
        throw Object.assign(
          new Error(`${path.basename(file)}: the events its system sends are read from its default export's spec, whose type doesn't resolve: check that its \`defineSystem\` import does, and that the pack's dependencies are installed`),
          { code: _TYPES_UNRESOLVED },
        );
      }
      const declared = spec && propertyType(spec, '_outgoing');
      if (!declared) {
        throw new Error(`${path.basename(file)}: the events its system sends are read from its default export's spec, and ${entry ? 'that spec carries none' : 'it has no default export'}: default-export the system entry declared with \`satisfies SystemEntry\` (an annotation \`: SystemEntry\` drops the spec's events)`);
      }
      return eventTypeLiterals(declared, path.basename(file), "its system's outgoing events", ' (an entry annotated `: SystemEntry` has these: default-export it declared with `satisfies SystemEntry`)');
    },
    acceptedEventTypesOf(file) {
      const entry = exportedValueType(file, 'accepts');
      // A plugin that declares no inbox takes only what its own feature's system sends it
      if (!entry) return [];
      if (entry.flags & ts.TypeFlags.Any) {
        throw Object.assign(
          new Error(`${path.basename(file)}: the events other plugins may send it are read from its \`accepts\` export, whose type doesn't resolve: check that its \`pluginAccepts\` import does, and that the pack's dependencies are installed`),
          { code: _TYPES_UNRESOLVED },
        );
      }
      const declared = propertyType(entry, '_accepts');
      if (!declared) {
        throw new Error(`${path.basename(file)}: its \`accepts\` export carries no events: declare it with \`pluginAccepts<…>()\`, whose type codegen reads`);
      }
      // A declared inbox that resolves to `never` is the annotation mistake: `PluginAccepts`'s own type parameter
      // defaults to `never`, so `const accepts: PluginAccepts = pluginAccepts<Foo>()` silently drops `Foo`. It is
      // self-consistent — no sender compiles either — but the author is told nothing at the declaration.
      if (declared.flags & ts.TypeFlags.Never) {
        throw new Error(`${path.basename(file)}: its \`accepts\` export declares no events: write \`export const accepts = pluginAccepts<…>()\` without a type annotation, which would drop them, or remove the export if nothing else sends to this plugin`);
      }
      return eventTypeLiterals(declared, path.basename(file), 'the events it accepts', ' (an `accepts` annotated `: PluginAccepts` has these: declare it as `pluginAccepts<…>()` alone)');
    },
  };

  /** The `type` literals of an event union a phantom carries; `never` is none, and a lone event is its own type. */
  function eventTypeLiterals(declared: TS.Type, file: string, what: string, annotated: string): string[] {
    if (declared.flags & ts.TypeFlags.Never) return [];
    const members = declared.isUnion() ? declared.types : [declared];
    return members.flatMap((member) => {
      const declaredType = propertyType(member, 'type');
      // `{ type: 'A' | 'B' }` is one member covering two event types, which is a legal way to write
      // an event whose payload is the same either way. Reading only single literals rejected it, so
      // the union is expanded here and every constituent still has to be a literal.
      const literals = declaredType?.isUnion() ? declaredType.types : declaredType ? [declaredType] : [];
      if (literals.length === 0 || !literals.every((t) => t.isStringLiteral())) {
        // What an entry annotated with its contract leaves: the contract's own `{ type: string }`
        const widened = declaredType !== undefined && (declaredType.flags & ts.TypeFlags.String) !== 0 ? annotated : '';
        throw new Error(`${file}: ${what} have a member whose \`type\` is ${declaredType ? checker.typeToString(declaredType) : 'missing'}, not a string literal or a union of them: the event maps are read from these, and a member without one would leave them short${widened}`);
      }
      return literals.map((t) => (t as TS.StringLiteralType).value);
    });
  }
}
