import { executeTemplate } from '@/systems/brain/utils/template-executor';
import { repository } from '@/repository';
import type { PromptEntity } from '@/systems/prompts/types';

export class PromptService {
  async getByLabel(label: string): Promise<PromptEntity | undefined> {
    return repository.promptQueries.byLabel(label);
  }

  async executeTemplate(templateFn: string, templateParams: Record<string, any>): Promise<string> {
    return executeTemplate(templateFn, templateParams);
  }

  async getAndExecute(label: string, templateParams: Record<string, any>): Promise<string | undefined> {
    const prompt = await this.getByLabel(label);
    if (!prompt) {
      return undefined;
    }
    return this.executeTemplate(prompt.templateFn, templateParams);
  }
}

export const promptService = new PromptService();