import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'PR to Markdown',
  description: 'Renders current branch PR comments to markdown in the chat thread',
  category: 'commands',
  input: {
    text: { type: 'string', description: 'Optional PR number', required: false },
    threadId: { type: 'string', description: 'Thread ID for output', required: false },
  },
};

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatReviewThreads(threads: any[]): string {
  if (threads.length === 0) return '';

  const lines: string[] = [`## Review Threads (${threads.length})`];

  for (const thread of threads) {
    const status = thread.isResolved ? 'resolved' : 'active';
    const location = thread.line ? `${thread.path}:${thread.line}` : thread.path;
    lines.push(`### ${location} (${status})`);

    for (let i = 0; i < thread.comments.length; i++) {
      const c = thread.comments[i];
      if (i === 0) {
        lines.push(`**@${c.author.login}** — ${formatDate(c.createdAt)}`);
        lines.push(c.body);
      } else {
        lines.push(`> **@${c.author.login}** — ${formatDate(c.createdAt)}`);
        lines.push(c.body.split('\n').map((l: string) => `> ${l}`).join('\n'));
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatPRMarkdown(pr: any, comments: any[], threads: any[]): string {
  const lines: string[] = [
    `# PR #${pr.number}: ${pr.title}`,
    `**Branch:** ${pr.headRefName} → ${pr.baseRefName} | **Author:** @${pr.author.login} | **Status:** ${pr.state}${pr.isDraft ? ' (Draft)' : ''}`,
    `**URL:** ${pr.url}`,
    '',
  ];

  if (pr.body?.trim()) {
    lines.push('## Description', pr.body.trim(), '');
  }

  if (comments.length > 0) {
    lines.push(`## Comments (${comments.length})`);
    for (const c of comments) {
      lines.push(`### @${c.author.login} — ${formatDate(c.createdAt)}`);
      lines.push(c.body, '');
    }
  }

  const threadsMd = formatReviewThreads(threads);
  if (threadsMd) {
    lines.push(threadsMd);
  }

  return lines.join('\n');
}

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const { text, threadId } = params;

  try {
    let prNumber: number | undefined;
    if (text?.trim()) {
      prNumber = parseInt(text.trim(), 10);
      if (isNaN(prNumber)) {
        if (threadId) {
          services.chat.sendBlockMessage({
            threadId,
            text: `Invalid PR number: "${text.trim()}"`,
            blocks: [],
          });
        }
        return { success: false, error: 'Invalid PR number' };
      }
    }

    let pr: any;
    if (prNumber) {
      const details = await services.cli.gh.getPRDetails(prNumber);
      pr = details;
    } else {
      const branchPR = await services.cli.gh.getPRForBranch();
      if (!branchPR) {
        if (threadId) {
          const branch = await services.cli.git.getCurrentBranch();
          services.chat.sendBlockMessage({
            threadId,
            text: `No PR found for branch "${branch}"`,
            blocks: [],
          });
        }
        return { success: false, error: 'No PR found for current branch' };
      }
      pr = await services.cli.gh.getPRDetails(branchPR.number);
    }

    const threads = await services.cli.gh.getReviewThreads(pr.number);
    const markdown = formatPRMarkdown(pr, pr.comments || [], threads);

    if (threadId) {
      services.chat.sendBlockMessage({
        threadId,
        text: markdown,
        blocks: [],
      });
    }

    return { success: true, prNumber: pr.number, markdown };
  } catch (error: any) {
    const errorMsg = error?.message || 'Failed to fetch PR';
    if (threadId) {
      services.chat.sendBlockMessage({
        threadId,
        text: `pr2md failed: ${errorMsg}`,
        blocks: [],
      });
    }
    return { success: false, error: errorMsg };
  }
}
