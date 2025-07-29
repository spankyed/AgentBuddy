import { z } from 'zod';
import Services from '@/services';

/**
 * Name: Route Procedure
 * Category: routing
 * Description: Routes user messages to appropriate procedures based on LLM analysis of procedure usage docs
 *
 * @param {Object} params
 * @param {Object} params.message
 * @param {string} params.message.text - User's message text
 * @param {string} [params.message.mode] - Optional message mode
 * @param {string} [params.message.threadId] - Optional thread ID
 * @param {typeof Services} services
 * @returns {Promise<Object>} Object with procedure name, executed status, and success flag
 * @throws {Error} When no procedure documents found or execution fails
 */
export async function routeProcedure(params, services) {
  const { message } = params;
  const { text, mode, threadId } = message;

  try {
    /** ──────────────────────────────────────────────────────────────
    * 1. Load all procedure-related documents
    * ──────────────────────────────────────────────────────────────*/
    const allDocs = await services.library.getWithinFolder('procedures')

    if (!Array.isArray(allDocs) || allDocs.length === 0) {
      throw new Error('No procedure documents found in "procedures" collection')
    }

    /** 2. Collect the "*.usage" docs and build the LLM prompt */
    const usageDocs = allDocs.filter(d => d.name.endsWith('.usage'))

    services.logger.info('procedure check 1', { allDocs, usageDocs })

    if (usageDocs.length === 0) {
      throw new Error('No "*.usage" documents found')
    }

    const procedureNames = usageDocs.map(d => d.name.replace(/\.usage$/, ''))
    const proceduresPrompt = usageDocs
      .map(d => {
        const name = d.name.replace(/\.usage$/, '')
        return `<procedure>Name: ${name} Usage: ${d.content}</procedure>`
      })
      .join('\n\n')

    /** 3. Ask the LLM which procedure (if any) matches the user's request */
    const procedureOptions = [...procedureNames, 'none'];
    const ProcedureSelectionSchema = z.object({
      procedure: z.enum(procedureOptions).describe('Chosen procedure name or "none"')
    })

    const llmResult = await services.llm.generateObject({
      model: { provider: 'openai', model: 'gpt-4o' },
      schema: ProcedureSelectionSchema,
      prompt: `
      You are an expert router. Given a user message, decide which procedure (if any) best handles it.

      <procedures>
      ${proceduresPrompt}
      </procedures>

      Respond with JSON matching the schema, using one of the procedure names above or "none".
      
      User message: """${text}"""
    `,
      temperature: 0
    })

    const { procedure } = llmResult.object;

    services.logger.info('procedure check 2', { proceduresPrompt, procedure })

    /** ──────────────────────────────────────────────────────────────
     * 4. Route to the chosen procedure or fall back to streaming
     * ──────────────────────────────────────────────────────────────*/
    if (procedure !== 'none') {
      const procDoc = allDocs.find(d => d.name === `${procedure}.procedure`)
      if (!procDoc) {
        throw new Error(`Procedure implementation document "${procedure}.procedure" not found`)
      }

      const actionKey = procDoc.content.trim()

      await services.action.getAndExecute(actionKey, { searchQuery: text })
      
      return {
        procedure,
        executed: true,
        success: true
      };
    } else {
      // await services.action.getAndExecute('Stream to FE', { message: text })
      services.logger.info('About to Add Message to Thread', { text, threadId, sender: 'user' })
      const addMessageResult = await services.action.getAndExecute('Add Message to Thread', {
        text,
        threadId,
        sender: 'user'
      })

      await services.action.getAndExecute('Stream to FE', {
        message: text,
        // threadId,
      })

      console.log({ addMessageResult })

      return {
        procedure: 'none',
        executed: false,
        success: true
      };
    }
  } catch (error) {
    services.logger.error('Procedure routing failed', { error });
    // Fallback behaviour here if needed
    throw error;
  }
}