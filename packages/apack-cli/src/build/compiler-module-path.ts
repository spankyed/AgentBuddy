/** tsx appends a scope query to filenames; the question mark in a Windows device prefix is path data. */
export function splitCompilerModulePath(value: string): [file: string, query: string] {
  const separator = value.indexOf('?', value.startsWith('\\\\?\\') ? 4 : 0);
  return separator < 0 ? [value, ''] : [value.slice(0, separator), value.slice(separator)];
}
