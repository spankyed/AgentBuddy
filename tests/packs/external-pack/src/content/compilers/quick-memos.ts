// The "quick-memos" seed format's compiler module (abuddy.json content.formats): one Memo per line
import * as fs from 'node:fs';
import type { ContentCompileContext, ContentItem } from '@abuddy/sdk/build';

const titleOf = (text: string): string => `Quick: ${text}`;

export default function compileQuickMemos({ path }: ContentCompileContext): ContentItem[] {
  return fs.readFileSync(path, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ entity: 'Memo', title: titleOf(text), text }));
}
