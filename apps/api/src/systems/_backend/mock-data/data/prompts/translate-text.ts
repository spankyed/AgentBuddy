import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';

const nowMs = Date.now();

export const translateTextPrompt: Rows = {
  entity: [
    {
      id: 'Prompt-4',
      entityType: EARS.Entity.Prompt,
      label: 'Translate Text',
      description: 'Translates text between languages',
      category: 'text-processing',
      inputs: {
        text: {
          name: 'text',
          type: 'string',
          description: 'The text to translate',
          required: true
        },
        sourceLang: {
          name: 'sourceLang',
          type: 'string',
          description: 'Source language (e.g., "en", "es", "fr")',
          required: false,
          defaultValue: 'auto'
        },
        targetLang: {
          name: 'targetLang',
          type: 'string',
          description: 'Target language (e.g., "en", "es", "fr")',
          required: true,
          example: 'en'
        },
        style: {
          name: 'style',
          type: 'string',
          description: 'Translation style',
          required: false,
          defaultValue: 'natural'
        }
      },
      templateFn: `const { text, sourceLang = 'auto', targetLang, style = 'natural' } = params;

// prettier-ignore
return \`
Please translate the following text to \${targetLang}:

\${text}

Translation requirements:
- \${sourceLang === 'auto' ? 'Detect the source language automatically' : 'Source language: ' + sourceLang}
- Target language: \${targetLang}
- Translation style: \${style} (preserve the original tone and meaning)
- Maintain formatting and structure
- Ensure cultural appropriateness

Provide only the translated text without explanations.
\`;`,
      createdAt: nowMs - 86400000 * 4,
      updatedAt: nowMs - 86400000 * 1
    }
  ],
  
  role: [],
  
  relation: []
};