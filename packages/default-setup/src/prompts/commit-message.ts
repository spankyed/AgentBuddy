import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'Commit Message',
  description: 'Generate a conventional commit message from a git diff',
  category: 'git',
  inputs: {
    diff: { name: 'diff', type: 'string', description: 'Git diff output', required: true },
    branch: { name: 'branch', type: 'string', description: 'Current branch name', required: false },
    repoName: { name: 'repoName', type: 'string', description: 'Repository name', required: false },
  },
};

export function template(params: Record<string, any>) {
  const { diff, branch, repoName } = params;

  const metadata = [
    repoName ? `Repository: ${repoName}` : '',
    branch ? `Branch: ${branch}` : '',
  ].filter(Boolean).join('\n');

  return `Generate a git commit message for the following changes.

${metadata ? metadata + '\n' : ''}
Diff:

${diff}

Rules:
- Use conventional commits format: type(scope): description
- Types: feat, fix, refactor, docs, chore, style, test, perf, ci, build
- Scope is optional, use it when the change is clearly scoped to one area
- Keep the subject line under 72 characters
- Use imperative mood ("add" not "added", "fix" not "fixed")
- If the diff includes multiple logical changes, summarize the primary change on the subject line and add bullet points on subsequent lines
- Use the branch name as a hint for the change's purpose, but base the message on the actual diff
- Output ONLY the commit message — no preamble, no markdown, no backticks, no quotes, no explanation`;
}
