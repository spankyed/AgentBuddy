/**
 * Shared parser for the CLI's `/context` markdown response.
 * Used by both cc-context.ts (on-demand command) and turn-completed.ts
 * (post-turn context refresh on the session artifact).
 */

export interface ContextUsageData {
  model: string;
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  categories: Array<{ name: string; tokens: number; percentage: number }>;
  memoryFiles?: Array<{ type: string; path: string; tokens: number }>;
  skills?: Array<{ name: string; source: string; tokens: number }>;
}

export function parseTokenCount(s: string): number {
  const trimmed = s.trim();
  const n = parseFloat(trimmed);
  if (trimmed.endsWith('k') || trimmed.endsWith('K')) return Math.round(n * 1000);
  if (trimmed.endsWith('M') || trimmed.endsWith('m')) return Math.round(n * 1_000_000);
  return Math.round(n);
}

export function parseContextMarkdown(md: string): ContextUsageData | null {
  if (!md) return null;

  const modelMatch = md.match(/\*\*Model:\*\*\s*(.+)/);
  const tokensMatch = md.match(/\*\*Tokens:\*\*\s*([\d,.]+[kKmM]?)\s*\/\s*([\d,.]+[kKmM]?)\s*\((\d+)%\)/);
  if (!tokensMatch) return null;

  const categories: Array<{ name: string; tokens: number; percentage: number }> = [];
  const catRegex = /\|\s*([^|]+?)\s*\|\s*([\d,.]+[kKmM]?)\s*\|\s*([\d.]+)%\s*\|/g;
  let m;
  while ((m = catRegex.exec(md)) !== null) {
    const name = m[1].trim();
    if (name === 'Category' || name.startsWith('---')) continue;
    categories.push({ name, tokens: parseTokenCount(m[2]), percentage: parseFloat(m[3]) });
  }

  const memoryFiles = parseDetailSection(md, 'Memory Files', ['type', 'path', 'tokens']);
  const skills = parseDetailSection(md, 'Skills', ['name', 'source', 'tokens']);

  return {
    model: modelMatch?.[1]?.trim() || '',
    totalTokens: parseTokenCount(tokensMatch[1]),
    maxTokens: parseTokenCount(tokensMatch[2]),
    percentage: parseInt(tokensMatch[3]),
    categories,
    memoryFiles: memoryFiles.length ? memoryFiles : undefined,
    skills: skills.length ? skills : undefined,
  };
}

function parseDetailSection(md: string, heading: string, columns: string[]): any[] {
  const sectionRegex = new RegExp(`### ${heading}[\\s\\S]*?(?=###|$)`);
  const section = md.match(sectionRegex)?.[0];
  if (!section) return [];

  const rows: any[] = [];
  const rowRegex = /\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
  let m;
  let skipCount = 0;
  while ((m = rowRegex.exec(section)) !== null) {
    if (skipCount < 2) { skipCount++; continue; }
    const entry: any = {};
    for (let i = 0; i < columns.length; i++) {
      const val = m[i + 1]?.trim() || '';
      entry[columns[i]] = columns[i] === 'tokens' ? parseTokenCount(val) : val;
    }
    rows.push(entry);
  }
  return rows;
}
