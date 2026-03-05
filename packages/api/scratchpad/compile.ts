import { compileAllSourceFiles, type CompileConfig } from './compile-utils';

const configs: Record<string, CompileConfig> = {
  actions: {
    sourceDir: 'actions',
    outputFile: 'actions/compiled-actions.json',
    functionName: 'action',
    isAsync: true,
    fields: { metaInput: 'input', fnBody: 'actionFn', output: 'output' },
  },
  prompts: {
    sourceDir: 'prompts',
    outputFile: 'prompts/compiled-prompts.json',
    functionName: 'template',
    isAsync: false,
    fields: { metaInput: 'inputs', fnBody: 'templateFn', output: 'outputSchema' },
  },
};

const target = process.argv[2];

if (!target || !configs[target]) {
  console.error(`Usage: tsx compile.ts <${Object.keys(configs).join('|')}>`);
  process.exit(1);
}

compileAllSourceFiles(configs[target]).catch(err => {
  console.error('Compilation failed:', err);
  process.exit(1);
});
