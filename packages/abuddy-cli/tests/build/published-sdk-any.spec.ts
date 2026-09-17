import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, installPublishedPackages } from '../helpers/published-packages';

let consumer: string | undefined;
beforeAll(() => {
  if (PACKAGES_BUILT) consumer = installPublishedPackages();
}, 120_000);
afterAll(() => {
  if (consumer) fs.rmSync(consumer, { recursive: true, force: true });
});

/** `<subpath> <export>` for each pack-facing export whose type contains `any` */
function exportsWithAny(sdkDir: string): string[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(sdkDir, 'package.json'), 'utf-8'));
  const entries = Object.entries(manifest.exports as Record<string, unknown>)
    .filter(([, target]) => typeof target === 'object' && target !== null && 'types' in target)
    .map(([key, target]) => [key, path.join(sdkDir, (target as { types: string }).types)] as const);
  const program = ts.createProgram(entries.map(([, file]) => file), {
    strict: true, skipLibCheck: true, noEmit: true, types: ['node'],
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  const checker = program.getTypeChecker();
  const sdkRoot = fs.realpathSync(sdkDir);
  const standardLibrary = (node: ts.Node) => program.isSourceFileDefaultLibrary(node.getSourceFile());
  const thirdParty = (node: ts.Node) => {
    const file = node.getSourceFile().fileName;
    return /\/node_modules\//.test(file) && !standardLibrary(node) && !fs.realpathSync(file).startsWith(sdkRoot + path.sep);
  };
  const typeArguments = (type: ts.Type) => (type.flags & ts.TypeFlags.Object && (type as ts.TypeReference).target
    ? checker.getTypeArguments(type as ts.TypeReference)
    : []);

  /** `<T = any>`: a caller who doesn't pass T gets any */
  function defaultsToAny(parameter: ts.TypeParameter, seen: Set<ts.Type>, depth: number): boolean {
    const fallback = checker.getDefaultFromTypeParameter(parameter);
    return !!fallback && containsAny(fallback, seen, depth + 1);
  }

  function containsAny(type: ts.Type, seen: Set<ts.Type>, depth: number): boolean {
    if (type.flags & ts.TypeFlags.Any) return true;
    if (seen.has(type) || depth > 6) return false;
    seen.add(type);
    const alias = type.aliasSymbol?.declarations?.[0];
    const declaration = type.symbol?.declarations?.[0];
    if ((alias && thirdParty(alias)) || (declaration && thirdParty(declaration))) return false;
    if ((alias && standardLibrary(alias)) || (declaration && standardLibrary(declaration))) {
      const args = [...(alias && standardLibrary(alias) ? type.aliasTypeArguments ?? [] : []), ...typeArguments(type)];
      return args.some((t) => containsAny(t, seen, depth + 1));
    }
    if (type.isUnionOrIntersection()) return type.types.some((t) => containsAny(t, seen, depth + 1));
    for (const signature of [...type.getCallSignatures(), ...type.getConstructSignatures()]) {
      if (containsAny(signature.getReturnType(), seen, depth + 1)) return true;
      if (signature.getTypeParameters()?.some((p) => defaultsToAny(p, seen, depth))) return true;
      if (signature.getParameters().some((p) => containsAny(checker.getTypeOfSymbol(p), seen, depth + 1))) return true;
    }
    if (!(type.flags & ts.TypeFlags.Object)) return false;
    if (typeArguments(type).some((t) => containsAny(t, seen, depth + 1))) return true;
    if (checker.getIndexInfosOfType(type).some((info) => containsAny(info.type, seen, depth + 1))) return true;
    return type.getProperties().some((property) => {
      const member = property.valueDeclaration ?? property.declarations?.[0];
      if (member && (thirdParty(member) || ts.getCombinedModifierFlags(member as ts.Declaration) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected))) return false;
      return containsAny(checker.getTypeOfSymbol(property), seen, depth + 1);
    });
  }

  const found: string[] = [];
  for (const [key, file] of entries) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(file)!);
    for (const symbol of module ? checker.getExportsOfModule(module) : []) {
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const declaration = target.declarations?.[0];
      if (!declaration || thirdParty(declaration)) continue;
      const type = target.flags & ts.SymbolFlags.Type && !(target.flags & ts.SymbolFlags.Value)
        ? checker.getDeclaredTypeOfSymbol(target)
        : checker.getTypeOfSymbolAtLocation(target, declaration);
      const typeParameters = ts.getEffectiveTypeParameterDeclarations(declaration as ts.DeclarationWithTypeParameters)
        .map((parameter) => checker.getTypeAtLocation(parameter) as ts.TypeParameter);
      if (containsAny(type, new Set(), 0) || typeParameters.some((p) => defaultsToAny(p, new Set(), 0))) found.push(`${key} ${symbol.name}`);
    }
  }
  return found;
}

/**
 * No pack-facing @abuddy/sdk export exposes `any`: an export whose type (its signature, public
 * members, type arguments or type parameter defaults, a few levels deep) contains `any` fails. A third-party library's own
 * types (xstate AnyActorRef, vue Component, zod schemas) are the library's business and aren't
 * walked; standard library types (Array, Promise, Record) are, through the type arguments the SDK
 * passes them.
 */
describe.skipIf(!PACKAGES_BUILT)('published @abuddy/sdk', () => {
  it('exposes no any', () => {
    expect(exportsWithAny(path.join(consumer!, 'node_modules', '@abuddy', 'sdk'))).toEqual([]);
  }, 120_000);
});
