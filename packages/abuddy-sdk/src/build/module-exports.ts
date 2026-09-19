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
   * The `type` literals of an exported event union: `{ type: 'A' } | { type: 'B' }` reads as `['A', 'B']`.
   * Undefined when `file` exports no such name. A member with no literal `type` — a union widened to
   * `string`, or a shape that isn't an event — throws, because a map built from it would be silently
   * short and the check over it would reject real events.
   */
  eventTypesOf(file: string, name: string): string[] | undefined;
}

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

  /** The declared type of an exported name, following aliases, or undefined when there is none */
  function exportedType(file: string, name: string): TS.Type | undefined {
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
    return checker.getDeclaredTypeOfSymbol(symbol);
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

    eventTypesOf(file, name) {
      const declared = exportedType(file, name);
      if (!declared) return undefined;
      // A single event is its own type, not a union of one
      const members = declared.isUnion() ? declared.types : [declared];
      return members.flatMap((member) => {
        const property = member.getProperty('type');
        const declaredType = property && checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration ?? property.declarations![0]);
        // `{ type: 'A' | 'B' }` is one member covering two event types, which is a legal way to write
        // an event whose payload is the same either way. Reading only single literals rejected it, so
        // the union is expanded here and every constituent still has to be a literal.
        const literals = declaredType?.isUnion() ? declaredType.types : declaredType ? [declaredType] : [];
        if (literals.length === 0 || !literals.every((t) => t.isStringLiteral())) {
          throw new Error(`${path.basename(file)} exports "${name}" with a member whose \`type\` is ${declaredType ? checker.typeToString(declaredType) : 'missing'}, not a string literal or a union of them: the events a plugin receives are read from these, and a member without one would leave the map short`);
        }
        return literals.map((t) => (t as import('typescript').StringLiteralType).value);
      });
    },
  };
}
