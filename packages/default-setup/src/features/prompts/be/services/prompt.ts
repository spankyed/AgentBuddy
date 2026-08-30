import { executeTemplate } from '@/features/brain/be/utils/template-executor';
import { createPromptContext } from '@/features/brain/be/utils/prompt-context';
import { repository } from '@abuddy/sdk/ears';
import type { PromptEntity } from '@/features/prompts/be/types';

export class PromptService {
  getByLabel(label: string) {
    return repository.promptQueries.byLabel(label);
  }

  /**
   * Execute a template with prompt context for accessing other prompts
   * @param templateFn - The template function body
   * @param templateParams - Parameters to pass to the template
   */
  executeTemplate(
    templateFn: string, 
    templateParams: Record<string, any>
  ): string {
    const context = createPromptContext(executeTemplate);
    return executeTemplate(templateFn, templateParams, context);
  }

  /**
   * Get and execute a prompt by label
   * @param label - The prompt label
   * @param templateParams - Parameters to pass to the template
   */
  usePrompt(
    label: string, 
    templateParams: Record<string, any>
  ) {
    const prompt = this.getByLabel(label);
    if (!prompt) {
      return undefined;
    }
    return this.executeTemplate(prompt.templateFn, templateParams);
  }
}

export const promptService = new PromptService();