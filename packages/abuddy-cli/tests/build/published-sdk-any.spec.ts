import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ONLY_EXPORTS } from '@abuddy/host/build/shared-deps';
import { PACKAGES_BUILT, installPublishedPackages } from '../helpers/published-packages';

let consumer: string | undefined;
beforeAll(() => {
  if (PACKAGES_BUILT) consumer = installPublishedPackages();
}, 120_000);
afterAll(() => {
  if (consumer) fs.rmSync(consumer, { recursive: true, force: true });
});

/**
 * The published packages a pack installs and imports directly. Their declarations are ours, so `any`
 * in any of them is a leak and is walked wherever it's reached — including from another one's types,
 * since @abuddy/sdk's surface is largely @abuddy/ears' types. Everything else under node_modules
 * (vue, zod, ai, xstate) is a library's own business and is not walked.
 */
const PACK_FACING_PACKAGES = ['@abuddy/ears', '@abuddy/sdk', '@abuddy/ui'];
/** Of those, the ones whose own exports are scanned: @abuddy/ui's surface is its component reports' */
const SCANNED_PACKAGES = ['@abuddy/sdk', '@abuddy/ears'];

/** Where those packages are installed, as real paths, for the first-party check */
function packFacingRoots(consumerDir: string): string[] {
  return PACK_FACING_PACKAGES
    .map((name) => path.join(consumerDir, 'node_modules', ...name.split('/')))
    .filter((dir) => fs.existsSync(dir))
    .map((dir) => fs.realpathSync(dir));
}

/** `<subpath> <export>` for each pack-facing export whose type contains `any` */
function exportsWithAny(packageName: string, packageDir: string, firstPartyRoots: string[]): string[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'));
  const entries = Object.entries(manifest.exports as Record<string, unknown>)
    .filter(([key]) => !Object.hasOwn(APP_ONLY_EXPORTS, key === '.' ? packageName : `${packageName}/${key.slice(2)}`))
    .filter(([, target]) => typeof target === 'object' && target !== null && 'types' in target)
    .map(([key, target]) => [key, path.join(packageDir, (target as { types: string }).types)] as const);
  const program = ts.createProgram(entries.map(([, file]) => file), {
    strict: true, skipLibCheck: true, noEmit: true, types: ['node'],
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  const checker = program.getTypeChecker();
  const standardLibrary = (node: ts.Node) => program.isSourceFileDefaultLibrary(node.getSourceFile());
  const firstParty = (file: string) => firstPartyRoots.some((root) => fs.realpathSync(file).startsWith(root + path.sep));
  const thirdParty = (node: ts.Node) => {
    const file = node.getSourceFile().fileName;
    return /\/node_modules\//.test(file) && !standardLibrary(node) && !firstParty(file);
  };
  const typeArguments = (type: ts.Type) => (type.flags & ts.TypeFlags.Object && (type as ts.TypeReference).target
    ? checker.getTypeArguments(type as ts.TypeReference)
    : []);

  /** `<T = any>` (a caller who leaves T out gets any) or `<T extends …any…>` (any is what T accepts and reads as) */
  function typeParameterLeaks(parameter: ts.TypeParameter, seen: Set<ts.Type>, depth: number): boolean {
    const fallback = checker.getDefaultFromTypeParameter(parameter);
    if (fallback && containsAny(fallback, seen, depth + 1)) return true;
    const constraint = checker.getBaseConstraintOfType(parameter);
    return !!constraint && containsAny(constraint, seen, depth + 1);
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
    if (type.flags & ts.TypeFlags.TypeParameter) return typeParameterLeaks(type as ts.TypeParameter, seen, depth);
    if (type.flags & ts.TypeFlags.Conditional) {
      // A generic conditional keeps its branches unresolved until it's instantiated, so walk the written ones
      const conditional = type as ts.ConditionalType;
      const branches = [conditional.root.node.trueType, conditional.root.node.falseType].map((node) => checker.getTypeFromTypeNode(node));
      if ([conditional.checkType, conditional.extendsType, ...branches].some((t) => containsAny(t, seen, depth + 1))) return true;
    }
    if (type.flags & ts.TypeFlags.IndexedAccess) {
      const indexed = type as ts.IndexedAccessType;
      if ([indexed.objectType, indexed.indexType].some((t) => containsAny(t, seen, depth + 1))) return true;
    }
    for (const signature of [...type.getCallSignatures(), ...type.getConstructSignatures()]) {
      if (containsAny(signature.getReturnType(), seen, depth + 1)) return true;
      if (signature.getTypeParameters()?.some((p) => typeParameterLeaks(p, seen, depth))) return true;
      // `this: any` is a parameter a caller's receiver is checked against, and it isn't in getParameters()
      const receiver = signature.thisParameter;
      if (receiver && containsAny(checker.getTypeOfSymbol(receiver), seen, depth + 1)) return true;
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

  function symbolLeaks(symbol: ts.Symbol, label: string, found: string[], depth: number): void {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const declaration = target.declarations?.[0];
    if (!declaration || thirdParty(declaration)) return;
    if (target.flags & ts.SymbolFlags.Module && depth < 4) {
      // A namespace's type-only members (`namespace EARS { type X = any }`) are in neither its value
      // type nor its declared type, so each export is checked on its own
      for (const member of checker.getExportsOfModule(target)) symbolLeaks(member, `${label}.${member.name}`, found, depth + 1);
      // A namespace with no value side has no type of its own, and the checker answers `any` for it
      if (!(target.flags & ts.SymbolFlags.ValueModule)) return;
    }
    const type = target.flags & ts.SymbolFlags.Type && !(target.flags & ts.SymbolFlags.Value)
      ? checker.getDeclaredTypeOfSymbol(target)
      : checker.getTypeOfSymbolAtLocation(target, declaration);
    const typeParameters = ts.getEffectiveTypeParameterDeclarations(declaration as ts.DeclarationWithTypeParameters)
      .map((parameter) => checker.getTypeAtLocation(parameter) as ts.TypeParameter);
    if (containsAny(type, new Set(), 0) || typeParameters.some((p) => typeParameterLeaks(p, new Set(), 0))) found.push(label);
  }

  const found: string[] = [];
  for (const [key, file] of entries) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(file)!);
    for (const symbol of module ? checker.getExportsOfModule(module) : []) symbolLeaks(symbol, `${key} ${symbol.name}`, found, 0);
  }
  return [...new Set(found)];
}

/**
 * No pack-facing export of the published packages exposes `any`: an export whose type (its
 * signature, `this` parameter, public members, type arguments, namespace members, conditional
 * branches, type parameter constraints or defaults, a few levels deep) contains `any` fails.
 *
 * `@abuddy/ears` and `@abuddy/sdk` are both ours and both installed by packs, so both are checked
 * and both are walked into; a third-party library's own types (xstate AnyActorRef, vue Component,
 * zod schemas) are the library's business and aren't walked. Standard library types (Array, Promise,
 * Record) are, through the type arguments we pass them. `@abuddy/ears/lmdb` is skipped with the rest
 * of `APP_ONLY_EXPORTS`: only the app's composition root loads it, never a pack.
 */
describe.skipIf(!PACKAGES_BUILT)('published pack-facing packages', () => {
  for (const name of SCANNED_PACKAGES) {
    it(`${name} exposes no any`, () => {
      const roots = packFacingRoots(consumer!);
      expect(exportsWithAny(name, path.join(consumer!, 'node_modules', ...name.split('/')), roots)).toEqual([]);
    }, 120_000);
  }
});
