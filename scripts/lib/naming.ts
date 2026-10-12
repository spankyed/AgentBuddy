import * as fs from 'node:fs';
import ts from 'typescript';
import { codeBlocks } from '../../packages/apack-cli/src/build/pack-sources.ts';

export interface ContextExportProblem {
  file: string;
  line: number;
}

/** Checks exported names, including aliases and barrels; private/local Context types are allowed. */
export function bareContextExports(files: readonly string[]): ContextExportProblem[] {
  const sources = new Map<string, { file: string; text: string }>();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (!file.endsWith('.vue')) {
      sources.set(file, { file, text });
      continue;
    }
    // Keep script offsets so diagnostics still name the original SFC line.
    let script = text.replace(/[^\n]/g, ' ');
    for (const block of codeBlocks(file, text)) {
      script = script.slice(0, block.offset) + block.content + script.slice(block.offset + block.content.length);
    }
    sources.set(`${file}.ts`, { file, text: script });
  }
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, customConditions: ['@apackdev/source'],
    allowJs: true, noEmit: true, types: [], skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile;
  const fileExists = host.fileExists;
  host.readFile = (file) => sources.get(file)?.text ?? readFile(file);
  host.fileExists = (file) => sources.has(file) || fileExists(file);
  host.getSourceFile = (file, languageVersion) => {
    const text = host.readFile(file);
    return text === undefined ? undefined : ts.createSourceFile(file, text, languageVersion, true);
  };
  const program = ts.createProgram([...sources.keys()], options, host);
  const checker = program.getTypeChecker();
  const problems: ContextExportProblem[] = [];
  for (const [name, { file }] of sources) {
    const source = program.getSourceFile(name)!;
    const module = checker.getSymbolAtLocation(source);
    if (!module) continue;
    const exported = checker.getExportsOfModule(module).find((symbol) => symbol.name === 'Context');
    if (!exported) continue;
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const typeOnly = exported.declarations?.some((node) => ts.isExportSpecifier(node)
      && (node.isTypeOnly || (ts.isExportDeclaration(node.parent.parent) && node.parent.parent.isTypeOnly)));
    if (!(target.flags & ts.SymbolFlags.Type) && !typeOnly) continue;
    // A star re-export has no local export specifier: report that statement in the barrel itself.
    const node = exported.declarations?.find((node) => node.getSourceFile() === source)
      ?? source.statements.find((node) => {
        if (!ts.isExportDeclaration(node) || node.exportClause || !node.moduleSpecifier) return false;
        const module = checker.getSymbolAtLocation(node.moduleSpecifier);
        return module && checker.getExportsOfModule(module).some((symbol) => symbol.name === 'Context');
      })
      ?? source;
    problems.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
  }
  return problems;
}
