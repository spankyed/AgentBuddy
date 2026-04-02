import type { ActionMeta, Services, Z } from '../types';

export const meta: ActionMeta = {
  label: 'Describe Doc Images',
  description: 'Fetches a document, extracts its images, and sends text + images to an AI model for description',
  category: 'vision',
  input: {
    documentId: {
      type: 'string',
      description: 'The library document ID to analyze',
      required: true,
      placeholder: 'e.g. doc-abc123',
    },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const { documentId } = params;

  // 1. Fetch the document
  const doc = await services.library.get(documentId);
  if (!doc) {
    throw new Error(`Document not found: ${documentId}`);
  }

  // 2. Extract markdown text from content sections
  const markdown = doc.content
    .filter((s): s is Extract<typeof s, { text: string }> => 'text' in s)
    .map(s => s.text)
    .join('\n');

  // 3. Get clean text (without image refs)
  const cleanText = services.media.stripMediaRefs(markdown);

  // 4. Extract images as AI SDK image parts
  const imageParts = services.media.extractImageParts(markdown);

  if (imageParts.length === 0) {
    services.logger.info('No images found in document, using text-only analysis');

    const result = await services.llm.generateText({
      model: { provider: 'openai', model: 'gpt-4o' },
      prompt: `Describe the following document:\n\n${cleanText}`,
    });

    return { description: result.text, imageCount: 0 };
  }

  // 5. Build multimodal message (Vercel AI SDK CoreMessage format)
  const messages: Parameters<typeof services.llm.generateText>[0]['messages'] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: `Describe this document and its images:\n\n${cleanText}` },
        ...imageParts,
      ],
    },
  ];

  // 6. Call LLM with multimodal message
  const result = await services.llm.generateText({
    model: { provider: 'openai', model: 'gpt-4o' },
    messages,
  });

  services.logger.info('Document image description complete', {
    documentId,
    imageCount: imageParts.length,
  });

  return {
    description: result.text,
    imageCount: imageParts.length,
  };
}
