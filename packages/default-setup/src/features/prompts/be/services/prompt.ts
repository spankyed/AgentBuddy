import { executeTemplate, createTemplateResolver } from '@abuddy/sdk/runtime';
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
    const resolver = createTemplateResolver(executeTemplate, (label: string) => this.getByLabel(label));
    return executeTemplate(templateFn, templateParams, resolver);
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