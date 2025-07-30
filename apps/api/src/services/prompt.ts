import { executeTemplate } from '@/systems/brain/utils/template-executor';
import { createPromptContext } from '@/systems/brain/utils/prompt-context';
import { repository } from '@/repository';
import type { PromptEntity } from '@/systems/prompts/types';

export class PromptService {
  async getByLabel(label: string): Promise<PromptEntity | undefined> {
    return repository.promptQueries.byLabel(label);
  }

  /**
   * Execute a template with optional context for accessing other prompts
   * @param templateFn - The template function body
   * @param templateParams - Parameters to pass to the template
   * @param withContext - Whether to provide prompt context for referencing other prompts
   */
  executeTemplate(
    templateFn: string, 
    templateParams: Record<string, any>,
    withContext: boolean = false
  ): string {
    if (withContext) {
      const context = createPromptContext(executeTemplate);
      return executeTemplate(templateFn, templateParams, context);
    }
    return executeTemplate(templateFn, templateParams);
  }

  /**
   * Get and execute a prompt by label
   * @param label - The prompt label
   * @param templateParams - Parameters to pass to the template
   * @param withContext - Whether to provide prompt context for referencing other prompts
   */
  async getAndExecute(
    label: string, 
    templateParams: Record<string, any>,
    withContext: boolean = true
  ): Promise<string | undefined> {
    const prompt = await this.getByLabel(label);
    if (!prompt) {
      return undefined;
    }
    return this.executeTemplate(prompt.templateFn, templateParams, withContext);
  }
}

export const promptService = new PromptService();