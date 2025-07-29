import { z } from 'zod';

/**
 * Name: Route Procedure
 * Category: routing
 * Description: Routes user messages to appropriate procedures based on LLM analysis of procedure usage docs
 *
 * @param {Object} params - Message object containing text, optional mode, and optional threadId
 * @param {Object} params.message - The user's message object
 * @param {string} params.message.text - The user's message text
 * @param {string} [params.message.mode] - Optional mode for the message
 * @param {string} [params.message.threadId] - Optional thread ID for context
 * @param {Object} services - Library, logger, LLM, and action services
 * @returns {Promise<Object>} Information about which procedure was selected and whether it was executed
 * @returns {string} returns.procedure - The selected procedure name or 'none'
 * @returns {boolean} returns.executed - Whether a procedure was executed
 * @returns {boolean} returns.success
 * @throws When no procedure documents are found or procedure execution fails
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
      await services.action.getAndExecute('Add Message to Thread', { text, threadId, sender: 'user' })
      
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