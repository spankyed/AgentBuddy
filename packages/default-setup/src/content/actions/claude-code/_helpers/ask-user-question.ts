/**
 * Parser for the `AskUserQuestion` tool input.
 *
 * Claude Code's `AskUserQuestion` tool sends structured questions with
 * options that the SDK consumer is expected to render and collect answers
 * for. This helper defensively parses the raw `unknown` input into typed
 * `ParsedQuestion` objects so `chat.ts` can render them as interactive
 * `choice` blocks.
 *
 * Files without `export const meta` are auto-inlined into the consuming
 * action at compile time (see packages/default-setup/CLAUDE.md).
 */

export interface ParsedQuestion {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect: boolean;
}

/**
 * Extract questions from the AskUserQuestion tool input. Never throws —
 * returns `{ questions: [] }` on any malformed input so the caller can
 * fall back to auto-approving with empty answers.
 */
export function parseAskUserQuestionInput(input: unknown): {
  questions: ParsedQuestion[];
} {
  if (!input || typeof input !== 'object') return { questions: [] };

  const raw = input as { questions?: unknown };
  if (!Array.isArray(raw.questions)) return { questions: [] };

  const questions: ParsedQuestion[] = [];
  for (const q of raw.questions) {
    if (!q || typeof q !== 'object') continue;
    const item = q as {
      question?: unknown;
      header?: unknown;
      options?: unknown;
      multiSelect?: unknown;
    };

    const question = typeof item.question === 'string' ? item.question : '';
    if (!question) continue;

    const header = typeof item.header === 'string' ? item.header : '';
    const multiSelect = item.multiSelect === true;

    const options: Array<{ label: string; description: string }> = [];
    if (Array.isArray(item.options)) {
      for (const opt of item.options) {
        if (!opt || typeof opt !== 'object') continue;
        const o = opt as { label?: unknown; description?: unknown };
        const label = typeof o.label === 'string' ? o.label : '';
        if (!label) continue;
        options.push({
          label,
          description: typeof o.description === 'string' ? o.description : '',
        });
      }
    }

    questions.push({ question, header, options, multiSelect });
  }

  return { questions };
}
