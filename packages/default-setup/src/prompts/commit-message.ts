import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'Commit Message',
  description: 'Generate a conventional commit message from a git diff',
  category: 'git',
  inputs: {
    diff: { name: 'diff', type: 'string', description: 'Git diff output', required: true },
  },
};

export function template(params: Record<string, any>) {
  const { diff } = params;

  return `Generate a concise git commit message for the following diff.

Rules:
- Use conventional commits format: type(scope): description
- Types: feat, fix, refactor, docs, chore, style, test, perf, ci, build
- Scope is optional, use it when the change is clearly scoped to one area
- Keep the first line under 72 characters
- Output ONLY the commit message text — no markdown, no backticks, no explanation
- Use imperative mood ("add" not "added", "fix" not "fixed")
- If the diff includes multiple logical changes, summarize the primary change on the first line and add bullet points on subsequent lines

Diff:

${diff}`;
}
