import dts from 'rollup-plugin-dts';
import { resolve } from 'path';

export default {
  input: resolve('./dsl/prompt.ts'),
  output: {
    file: resolve('./temp/prompt.d.ts'),
    format: 'es'
  },
  plugins: [
    dts({
      respectExternal: false,
      tsconfig: './dsl/tsconfig.dts.json'
    })
  ]
};