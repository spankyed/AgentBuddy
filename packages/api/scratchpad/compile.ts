import { compileAllSourceFiles, type CompileConfig } from './compile-utils';
import { compileFlows } from './compile-flows';
import { compileLibrary } from './compile-library';

const configs: Record<string, CompileConfig> = {
  actions: {
    sourceDir: 'actions',
    outputFile: 'compiled/compiled-actions.json',
    functionName: 'action',
    isAsync: true,
    fields: { metaInput: 'input', fnBody: 'actionFn', output: 'output' },
  },
  prompts: {
    sourceDir: 'prompts',
    outputFile: 'compiled/compiled-prompts.json',
    functionName: 'template',
    isAsync: false,
    fields: { metaInput: 'inputs', fnBody: 'templateFn', output: 'outputSchema' },
  },
};

const target = process.argv[2];

if (target === 'flows') {
  compileFlows().catch(err => {
    console.error('Flow compilation failed:', err);
    process.exit(1);
  });
} else if (target === 'library') {
  compileLibrary();
} else if (target && configs[target]) {
  compileAllSourceFiles(configs[target]).catch(err => {
    console.error('Compilation failed:', err);
    process.exit(1);
  });
} else {
  console.error(`Usage: tsx compile.ts <${[...Object.keys(configs), 'flows', 'library'].join('|')}>`);
  process.exit(1);
}
