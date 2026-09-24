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
   * The `type` literals of the events a system's contract says it sends its plugin, read from the type `name` that
   * `file` declares (`abuddy.json`'s `features[].system.contract`) — its `outgoing`.
   *
   * A declared type, as the plugin reader takes one. Reading a value's type instead is what made an annotation on
   * the system's default export (`: SystemEntry` rather than `satisfies`) silently drop every outgoing event, and
   * what left the reader unable to tell a broken install from a mistake, since a failed import reads as `any`.
   */
  outgoingEventTypesOf(file: string, name: string): string[];

  /**
   * The `type` literals of the events a plugin's contract says *other* plugins may send it, read from the type
   * `name` that `file` declares (`abuddy.json`'s `features[].plugin.contract`) — its `inbox`, across audiences.
   *
   * A contract with no `inbox` reads as `[]`: it publishes state only, and what its own feature's system sends it
   * is that system's outgoing union, which codegen adds. Throws when the module declares no such type, when the
   * inbox names an audience that doesn't exist, and on a member with no literal `type`, as the system reader does.
   *
   * It reads a *declared* type, never a value, which is what lets the contract live in a leaf module the plugin's
   * machine doesn't reach: reading it off `fe/plugin.ts` would pull in the machine, whose imports cycle back
   * through the generated events module this feeds.
   */
  inboxEventTypesOf(file: string, name: string): string[];

}

/** The audiences a plugin's inbox may open to, in the order an error lists them (`PluginInbox`, @abuddy/sdk/fe) */
const INBOX_AUDIENCES = ['pack', 'public'];

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
    const symbol = followAliases(exported);
    if (!symbol) return undefined;
    return symbol.flags & ts.SymbolFlags.Value ? checker.getTypeOfSymbol(symbol) : undefined;
  }

  /**
   * The type a module *declares* under `name` — a type alias or an interface — following aliases, or undefined
   * when it declares none. The counterpart of `exportedValueType`, which resolves values only: this is what lets
   * codegen read a contract that has no runtime value to hang a phantom property off.
   */
  /**
   * Follows `export { x } from` and import chains to the symbol that declares the name, or undefined when the
   * chain doesn't resolve. A circular re-export (`a.ts` → `b.ts` → `a.ts`) ends the walk rather than spinning:
   * the checker reports that as an error, and this reader queries the checker without reading its diagnostics.
   */
  function followAliases(symbol: TS.Symbol): TS.Symbol | undefined {
    const seen = new Set<TS.Symbol>([symbol]);
    let current = symbol;
    while (current.flags & ts.SymbolFlags.Alias) {
      const target = checker.getImmediateAliasedSymbol(current);
      if (!target || seen.has(target)) return undefined;
      seen.add(target);
      current = target;
    }
    return current;
  }

  function declaredTypeOf(file: string, name: string): TS.Type | undefined {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) throw new Error(`${file} is not part of the program reading pack exports`);
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    const exported = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === name);
    if (!exported) return undefined;
    const symbol = followAliases(exported);
    if (!symbol) return undefined;
    return symbol.flags & ts.SymbolFlags.Type ? checker.getDeclaredTypeOfSymbol(symbol) : undefined;
  }

  /** The type of property `name` of `type`, or undefined when it has none */
  function propertyType(type: TS.Type, name: string): TS.Type | undefined {
    const property = type.getProperty(name);
    const declaration = property && (property.valueDeclaration ?? property.declarations?.[0]);
    return property && (declaration ? checker.getTypeOfSymbolAtLocation(property, declaration) : checker.getTypeOfSymbol(property));
  }

  /**
   * Throws when part of a contract reads as `any` or `unknown` — what an import that didn't resolve leaves behind.
   *
   * Without this the readers below answer "no events" rather than failing: `getProperties()` on `any` is empty, so
   * a plugin whose inbox didn't resolve publishes an inbox nothing may send to, and the pack builds. Where it did
   * fail, it failed as "this member's `type` is missing" or "declares no `outgoing`" — both of which point the
   * author at their own contract, and the second of which advises deleting the manifest entry that is correct.
   *
   * It doesn't say why the type didn't resolve. A pack whose dependencies aren't installed reads exactly like one
   * with a misspelled import, which is why the code that claimed to tell them apart was removed.
   */
  function checkResolved(type: TS.Type, file: string, what: string): void {
    if (!(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))) return;
    // `typeToString` prints the alias as written (`PluginInbox<{ pack: NotesInbox }>`), which reads as though it
    // resolved, so name what it collapsed to first and show the written form as corroboration
    const collapsed = type.flags & ts.TypeFlags.Any ? 'any' : 'unknown';
    throw new Error(`${file}: ${what} resolves to \`${collapsed}\` — written as \`${checker.typeToString(type)}\` — so a type it names didn't resolve: an uninstalled dependency, or a name its module doesn't export. Read as it stands, it would contribute no events at all`);
  }

  return {
    exportOf(file, name) {
      const sourceFile = program.getSourceFile(file);
      if (!sourceFile) throw new Error(`${file} is not part of the program reading pack exports`);
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
      const exported = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === name);
      if (!exported) return undefined;

      // Follow `export { x } from` and `import`/`export` chains, noting a type-only link on the way. Bounded, as
      // `followAliases` is: a circular re-export would otherwise spin here.
      let symbol = exported;
      let typeOnly = false;
      const seen = new Set<TS.Symbol>([symbol]);
      while (symbol.flags & ts.SymbolFlags.Alias) {
        if (symbol.declarations?.some((declaration) => ts.isTypeOnlyImportOrExportDeclaration(declaration))) typeOnly = true;
        const target = checker.getImmediateAliasedSymbol(symbol);
        // An alias to a module the program can't resolve, or one that leads back to where it started
        if (!target || seen.has(target)) return undefined;
        seen.add(target);
        symbol = target;
      }

      const type = (symbol.flags & ts.SymbolFlags.Type) !== 0;
      if (typeOnly || !(symbol.flags & ts.SymbolFlags.Value)) return { type };
      if (symbol.flags & ts.SymbolFlags.Class) return { value: 'class', type };
      const callable = symbol.flags & ts.SymbolFlags.Function || checker.getTypeOfSymbol(symbol).getCallSignatures().length > 0;
      return { value: callable ? 'function' : 'object', type };
    },

    outgoingEventTypesOf(file, name) {
      const contract = declaredTypeOf(file, name);
      if (!contract) {
        throw new Error(`${path.basename(file)}: it declares no type "${name}". A system's contract is a declared type — \`export type ${name} = { context?: …; incoming?: …; internal?: …; outgoing: … }\` — named in abuddy.json at features[].system.contract`);
      }
      checkResolved(contract, path.basename(file), name);
      const declared = propertyType(contract, 'outgoing');
      if (!declared) {
        throw new Error(`${path.basename(file)}: ${name} declares no \`outgoing\` events. A system with none omits features[].system.contract rather than declaring an empty one`);
      }
      checkResolved(declared, path.basename(file), `${name}'s \`outgoing\` events`);
      return eventTypeLiterals(declared, path.basename(file), "its system's outgoing events");
    },
    inboxEventTypesOf(file, name) {
      const contract = declaredTypeOf(file, name);
      if (!contract) {
        throw new Error(`${path.basename(file)}: it declares no type "${name}". A plugin's contract is a declared type — \`export type ${name} = { state: …; inbox: … }\` — named in abuddy.json at features[].plugin.contract`);
      }
      checkResolved(contract, path.basename(file), name);
      const inbox = propertyType(contract, 'inbox');
      // A contract may publish state alone; its own system's events still reach it
      if (!inbox) return [];
      checkResolved(inbox, path.basename(file), `${name}'s inbox`);
      const audiences = inbox.getProperties();
      const unknown = audiences.filter((audience) => !INBOX_AUDIENCES.includes(audience.name));
      if (unknown.length > 0) {
        throw new Error(`${path.basename(file)}: ${name}'s inbox names ${unknown.map((a) => `"${a.name}"`).join(', ')}, which ${unknown.length > 1 ? 'are not audiences' : 'is not an audience'}: an inbox opens to ${INBOX_AUDIENCES.map((a) => `\`${a}\``).join(' or ')}. Declaring it with \`PluginInbox<…>\` would have caught this at the declaration`);
      }
      return audiences.flatMap((audience) => {
        const declared = propertyType(inbox, audience.name);
        return declared ? eventTypeLiterals(declared, path.basename(file), `the events it accepts from \`${audience.name}\``) : [];
      });
    },
  };

  /** The `type` literals of an event union a phantom carries; `never` is none, and a lone event is its own type. */
  function eventTypeLiterals(declared: TS.Type, file: string, what: string): string[] {
    if (declared.flags & ts.TypeFlags.Never) return [];
    const members = declared.isUnion() ? declared.types : [declared];
    return members.flatMap((member) => {
      checkResolved(member, file, what);
      const declaredType = propertyType(member, 'type');
      // `{ type: 'A' | 'B' }` is one member covering two event types, which is a legal way to write
      // an event whose payload is the same either way. Reading only single literals rejected it, so
      // the union is expanded here and every constituent still has to be a literal.
      const literals = declaredType?.isUnion() ? declaredType.types : declaredType ? [declaredType] : [];
      if (literals.length === 0 || !literals.every((t) => t.isStringLiteral())) {
        throw new Error(`${file}: ${what} have a member whose \`type\` is ${declaredType ? checker.typeToString(declaredType) : 'missing'}, not a string literal or a union of them: the event maps are read from these, and a member without one would leave them short`);
      }
      return literals.map((t) => (t as TS.StringLiteralType).value);
    });
  }
}
