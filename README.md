### Flows – the agent’s nervous system

> **Why they matter**  
> Systems and plugins give Agent-Buddy its extensible shell, but **flows** define the
> _actual behaviour_ of every agent. A flow is a directed graph of **steps**
> (nodes) that listen for events, transform data, call LLMs, or run custom code.
> Updating an agent is therefore a **data operation** (editing the graph) rather
> than a code change.

![Flow editor screenshot](docs/flows_editor.png)
*Alt: Screenshot of the visual flow editor showing a “User Message → Process User Message → Format Response → Stream to FE” pipeline, with an event trace panel on the right.*

#### Core concepts

| Concept        | Description                                                      |
|----------------|------------------------------------------------------------------|
| **Step**       | A single node in the graph (Listen, Query, LLM, Action, etc.).   |
| **Flow**       | A named collection of steps with one or more entry points.       |
| **Event**      | Typed message that triggers a Listen step (`USER_MESSAGE`, etc). |
| **Custom Action** | User-supplied JS/TS function executed inside a sandbox.        |

#### Example: streaming GPT-4o tokens to the chat plugin

1. **Listen step** &nbsp;`USER_MESSAGE` → captures raw user message.  
2. **LLM step** &nbsp;`Process User Message` → summarises intent.  
3. **LLM step** &nbsp;`Format Response` → converts summary into prose.  
4. **Action step** &nbsp;`Stream to FE` → runs the custom code below, pushing
   tokens back to the **agent** plugin in real-time.

```ts
// actions/streamToFe.ts
const actionFn = tidyFunction(`
  const { message } = params;

  const result = await services.llm.streamText({
    model: { provider: 'openai', model: 'gpt-4o' },
    prompt: message,
    system: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 100,
  });

  for await (const textPart of result.textStream) {
    services.logger.info('Streaming text', { textPart });
    services.emitter.sendToPlugin('agent', {
      type: 'TOKEN_STREAM',
      token: textPart,
    });
  }

  await result.finishReason;

  services.emitter.sendToPlugin('agent', { type: 'LLM_DONE' });
`);