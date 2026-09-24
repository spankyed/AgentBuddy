// The contract of each Vue component entry, for etc/<entry>.component.md. API Extractor can't see
// one: vue-tsc declares an SFC as a bare default export, which its report reduces to
// `const _default: typeof __VLS_export`. So the props, emits, slots and exposed members are read
// from the component's type with the TypeScript checker instead.
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

/** A component entry: the `.ts` module that re-exports an SFC's default, and the two declarations */
export interface ComponentEntry {
  key: string;
  /** The entry module's declaration, which the contract file imports the component from */
  declaration: string;
  /** The SFC's own declaration, where the component and the types it names are declared */
  componentDeclaration: string;
}

/** What componentContracts() needs of the package it reports on. */
export interface ContractOptions {
  /** The published package name, for the report heading */
  packageName: string;
  /** The package directory, which its tsconfig's relative paths resolve against */
  projectDir: string;
  /** Where the emitted declarations live; the temporary contract module is written here */
  typesDir: string;
  /** The tsconfig the declarations are read with */
  tsconfigPath: string;
  components: ComponentEntry[];
}

/**
 * The contract of each component, printed by the TypeScript checker: props (without Vue's own VNode
 * props), emits, slots and exposed instance members. vue-tsc declares a component with slots as an
 * intersection of constructors (__VLS_WithSlots), and vue-component-type-helpers infers from only
 * the last one, so the instance members are read from every construct signature; a functional
 * component uses the helpers.
 */
export function componentContracts(options: ContractOptions): Map<string, string> {
  const { packageName, projectDir, typesDir, tsconfigPath, components } = options;
  const contractFile = path.join(typesDir, '__component-contracts.ts');
  fs.writeFileSync(contractFile, [
    "import type { ComponentProps, ComponentEmit, ComponentSlots, ComponentExposed } from 'vue-component-type-helpers';",
    ...components.flatMap(({ declaration }, i) => {
      const specifier = `./${path.relative(typesDir, declaration).replace(/\.d\.ts$/, '.js')}`;
      return [
        `import C${i} from '${specifier}';`,
        `export const component${i} = C${i};`,
        `export type FunctionalProps${i} = ComponentProps<typeof C${i}>;`,
        `export type FunctionalEmit${i} = ComponentEmit<typeof C${i}>;`,
        `export type FunctionalSlots${i} = ComponentSlots<typeof C${i}>;`,
        `export type FunctionalExposed${i} = ComponentExposed<typeof C${i}>;`,
      ];
    }),
  ].join('\n'));
  const { config } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const { options: compilerOptions } = ts.parseJsonConfigFileContent(config, ts.sys, projectDir);
  const program = ts.createProgram([contractFile], { ...compilerOptions, noEmit: true });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    throw new Error(ts.formatDiagnostics(diagnostics, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => projectDir, getNewLine: () => '\n' }));
  }
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(contractFile)!;
  const flags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteArrowStyleSignature;
  const relativize = (text: string) => text.replaceAll(/import\("([^"]+)"\)/g, (_, file: string) => {
    const nodeModules = file.lastIndexOf('/node_modules/');
    return `import("${nodeModules >= 0 ? file.slice(nodeModules + '/node_modules/'.length) : path.relative(typesDir, file)}")`;
  });
  const scope = (name: string, meaning: ts.SymbolFlags) => checker.getSymbolsInScope(source, meaning).find((s) => s.name === name)!;
  const fromVue = (symbol: ts.Symbol) => (symbol.declarations ?? []).length > 0
    && symbol.declarations!.every((d) => /\/node_modules\/@vue\//.test(d.getSourceFile().fileName));
  // Union members print in type-creation order, which depends on the rest of the program: sort them
  const typeText = (type: ts.Type, location: ts.Node): string => {
    if (!type.isUnion() || type.aliasSymbol) return relativize(checker.typeToString(type, location, flags));
    let members = [...new Set(type.types.map((member) => typeText(member, location)))];
    if (members.includes('true') && members.includes('false')) members = [...members.filter((m) => m !== 'true' && m !== 'false'), 'boolean'];
    // Function and conditional types need parentheses inside a union
    return members.map((m) => (/=>|\bextends\b/.test(m) ? `(${m})` : m)).sort().join(' | ');
  };
  const member = (symbol: ts.Symbol, location: ts.Node) => {
    const optional = symbol.flags & ts.SymbolFlags.Optional ? '?' : '';
    return `  ${symbol.name}${optional}: ${typeText(checker.getTypeOfSymbolAtLocation(symbol, location), location)};`;
  };
  /** A member of the component instance, from any construct signature */
  const instanceMember = (component: ts.Type, name: string, location: ts.Node): ts.Type | undefined => {
    for (const signature of checker.getSignaturesOfType(component, ts.SignatureKind.Construct)) {
      const property = checker.getReturnTypeOfSignature(signature).getProperty(name);
      if (property) return checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(property, location));
    }
    return undefined;
  };

  const contracts = new Map<string, string>();
  components.forEach(({ key, componentDeclaration }, i) => {
    // Print each type as the component's own declaration sees it: a type that file imports prints
    // by name, the way someone reading the component does, instead of as a path into this build's
    // .temp — which would record how the dependency resolved rather than what the contract is
    const location = program.getSourceFile(componentDeclaration) ?? source;
    const component = checker.getTypeOfSymbolAtLocation(scope(`component${i}`, ts.SymbolFlags.Variable), source);
    const constructs = checker.getSignaturesOfType(component, ts.SignatureKind.Construct);
    const alias = (name: string) => checker.getDeclaredTypeOfSymbol(scope(`${name}${i}`, ts.SymbolFlags.TypeAlias));
    const propsType = constructs.length > 0 ? instanceMember(component, '$props', location) : alias('FunctionalProps');
    const emitType = constructs.length > 0 ? instanceMember(component, '$emit', location) : alias('FunctionalEmit');
    // Every Vue component instance has $props and $emit. Missing means this isn't the shape vue-tsc
    // emits, and the contract below would report a component with no props — a wrong answer that
    // reads like a real one. Fail instead.
    if (constructs.length > 0 && (!propsType || !emitType)) {
      throw new Error(`${packageName}${key.slice(1)}: its declaration has no ${!propsType ? '$props' : '$emit'} to read the contract from. vue-tsc's emitted shape has changed; scripts/component-contracts.ts needs updating.`);
    }
    const slotsType = constructs.length > 0 ? instanceMember(component, '$slots', location) : alias('FunctionalSlots');
    const exposedType = constructs.length > 0 ? checker.getReturnTypeOfSignature(constructs[0]) : alias('FunctionalExposed');

    const props = propsType ? checker.getPropertiesOfType(propsType).filter((p) => !fromVue(p)) : [];
    const propNames = new Set(props.map((p) => p.name));
    const emits = emitType ? checker.getSignaturesOfType(emitType, ts.SignatureKind.Call) : [];
    const slots = slotsType ? checker.getPropertiesOfType(slotsType).filter((p) => !fromVue(p)) : [];
    const exposed = checker.getPropertiesOfType(exposedType)
      .filter((p) => !p.name.startsWith('$') && !propNames.has(p.name) && !fromVue(p));
    const block = (title: string, lines: string[]) => [`${title} {`, ...lines.sort(), '}'];
    contracts.set(key, [
      `## Component contract for "${packageName}${key.slice(1)}"`,
      '',
      '> Generated by scripts/api-reports.ts; api:check fails when it is out of date.',
      '',
      '```ts',
      ...block('props', props.map((p) => member(p, location))),
      ...block('emits', emits.map((sig) => `  ${relativize(checker.signatureToString(sig, location, flags))};`)),
      ...block('slots', slots.map((p) => member(p, location))),
      ...block('exposed', exposed.map((p) => member(p, location))),
      '```',
      '',
    ].join('\n'));
  });
  fs.rmSync(contractFile);
  return contracts;
}

