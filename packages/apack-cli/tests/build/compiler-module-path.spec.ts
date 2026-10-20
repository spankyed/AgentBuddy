import { expect, it } from 'vitest';
import { splitCompilerModulePath } from '../../src/build/compiler-module-path.ts';

it.each([
  ['package/entry', 'package/entry', ''],
  ['./entry.cts?namespace=scope', './entry.cts', '?namespace=scope'],
  ['C:\\copy\\entry.cts', 'C:\\copy\\entry.cts', ''],
  ['\\\\?\\C:\\copy\\entry.cts', '\\\\?\\C:\\copy\\entry.cts', ''],
  ['\\\\?\\C:\\copy\\entry.cts?namespace=scope', '\\\\?\\C:\\copy\\entry.cts', '?namespace=scope'],
  ['\\\\?\\UNC\\server\\share\\entry.cts?namespace=scope', '\\\\?\\UNC\\server\\share\\entry.cts', '?namespace=scope'],
  ['file:///C:/copy/entry.cts?namespace=scope', 'file:///C:/copy/entry.cts', '?namespace=scope'],
])('separates module scope without truncating its filename: %s', (value, file, query) => {
  expect(splitCompilerModulePath(value)).toEqual([file, query]);
});
