/**
 * A document's sections as markdown, and back: the one syntax a `Document`'s `content` is written in on disk,
 * which the `documents` and `commands` content keys compile and an editor's import and export read and write.
 *
 * A section opens with `<!-- section:<type>[:<param>] -->`; a body with no markers is one markdown section.
 * Fields are `**key**: value` lines, which is how a command list holds its commands.
 */
import type { ContentSection } from '../types/sdk-entities.ts';

export function serializeDocumentSections(sections: ContentSection[]): string {
  const parts: string[] = [];

  for (const section of sections) {
    switch (section.type) {
      case 'markdown':
        parts.push(`<!-- section:markdown -->\n${section.text}`);
        break;
      case 'text':
        parts.push(`<!-- section:text -->\n${section.text}`);
        break;
      case 'code':
        parts.push(`<!-- section:code:${section.language} -->\n\`\`\`${section.language}\n${section.text}\n\`\`\``);
        break;
      case 'field':
        parts.push(`<!-- section:field -->\n${section.fields.map((f) => `**${f.key}**: ${f.value}`).join('\n')}`);
        break;
      case 'list':
        parts.push(`<!-- section:list -->\n${section.items.map((item) => `- ${item}`).join('\n')}`);
        break;
    }
  }

  return parts.join('\n\n');
}

const SECTION_MARKER_RE = /<!-- section:(\w+)(?::(\w+))? -->\n?/;

export function parseDocumentSections(body: string): ContentSection[] {
  // A body with no markers is one markdown section: what a plain document holds, not an older shape
  if (!SECTION_MARKER_RE.test(body)) {
    return [{ type: 'markdown', text: body }];
  }

  const sections: ContentSection[] = [];
  // Split on markers, capturing type and optional param
  const splitRe = /<!-- section:(\w+)(?::(\w+))? -->\n?/g;
  const parts: { type: string; param?: string; text: string }[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let prevPart: { type: string; param?: string; text: string } | null = null;

  while ((match = splitRe.exec(body)) !== null) {
    // Any text before the first marker (or between markers) belongs to the previous part
    if (prevPart) {
      prevPart.text = body.slice(lastIndex, match.index).trim();
      parts.push(prevPart);
    }
    prevPart = { type: match[1], param: match[2], text: '' };
    lastIndex = match.index + match[0].length;
  }

  // Last section gets remaining text
  if (prevPart) {
    prevPart.text = body.slice(lastIndex).trim();
    parts.push(prevPart);
  }

  for (const part of parts) {
    if (!part.text) continue;

    switch (part.type) {
      case 'field': {
        const fields: { key: string; value: string }[] = [];
        for (const line of part.text.split('\n')) {
          const m = line.match(/^\*\*(.+?)\*\*:\s*(.*)$/);
          if (m) fields.push({ key: m[1], value: m[2] });
        }
        if (fields.length) sections.push({ type: 'field', fields });
        break;
      }
      case 'list': {
        const items = part.text.split('\n')
          .filter((l) => l.startsWith('- '))
          .map((l) => l.slice(2));
        if (items.length) sections.push({ type: 'list', items });
        break;
      }
      case 'code': {
        const language = part.param || '';
        // Strip code fence if present
        const fenceMatch = part.text.match(/^```\w*\n([\s\S]*?)\n```$/);
        const text = fenceMatch ? fenceMatch[1] : part.text;
        sections.push({ type: 'code', language, text });
        break;
      }
      case 'text':
        sections.push({ type: 'text', text: part.text });
        break;
      case 'markdown':
      default:
        sections.push({ type: 'markdown', text: part.text });
        break;
    }
  }

  return sections;
}
