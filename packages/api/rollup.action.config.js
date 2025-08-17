import dts from 'rollup-plugin-dts';
import { resolve } from 'path';

export default {
  input: resolve('./dsl/action.ts'),
  output: {
    file: resolve('./temp/action.d.ts'),
    format: 'es'
  },
  plugins: [
    dts({
      respectExternal: false,
      tsconfig: './dsl/tsconfig.dts.json'
    })
  ]
};