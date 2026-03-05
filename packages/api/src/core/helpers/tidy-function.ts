/**
 * Trim + dedent a multiline template literal:
 *  • strips the leading/trailing blank lines
 *  • removes ONE leading tab “\t” (or 2/4 spaces) from every non-empty line
 */
export function tidyFunction(src: string): string {
  // 1 ▪ drop first/last blank lines
  const lines = src.replace(/^\s*\n|\n\s*$/g, '').split('\n');

  // 2 ▪ detect a single indent (tab or 2–4 spaces) on the first non-empty line
  const indent = (lines.find(l => l.trim())?.match(/^(\t| {2,4})/) ?? [])[1];

  // 3 ▪ if found, strip it from every line that has it
  return indent
    ? lines.map(l => l.startsWith(indent) ? l.slice(indent.length) : l)
      .join('\n')
    : lines.join('\n');
}
