import dts from 'rollup-plugin-dts';
import { resolve } from 'path';

export default {
  input: resolve('./dsl/database.ts'),
  output: {
    file: resolve('./temp/database.d.ts'),
    format: 'es'
  },
  plugins: [
    dts({
      respectExternal: false,
      tsconfig: './dsl/tsconfig.dts.json'
    })
  ]
};