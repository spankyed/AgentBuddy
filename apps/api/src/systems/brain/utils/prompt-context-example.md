# Prompt Context Example

This document demonstrates how to use the new prompt referencing feature that allows prompts to call other prompts within their template functions.

## Example Usage

### 1. Create a Base Prompt

First, create a base prompt that can be reused:

```javascript
// Prompt Label: "base-instructions"
// Template Function:
const role = params.role || 'assistant';
const style = params.style || 'professional';

return `You are a ${role} responding in a ${style} manner. 
Always be helpful, accurate, and respectful.`;
```

### 2. Create a Prompt that References the Base

Now create a prompt that uses the base prompt:

```javascript
// Prompt Label: "user-query-handler"
// Template Function:
// Get the base instructions
const baseInstructions = context.buildPrompt('base-instructions', {
  role: 'AI assistant',
  style: params.style || 'friendly'
});

// Get any additional context prompt if specified
let additionalContext = '';
if (params.contextPromptLabel) {
  const contextResult = context.buildPrompt(params.contextPromptLabel, params);
  if (contextResult) {
    additionalContext = `\n\n${contextResult}`;
  }
}

// Combine everything
return `${baseInstructions}${additionalContext}

User Query: ${params.userMessage}

Please provide a helpful response.`;
```

### 3. Create a Specialized Context Prompt

```javascript
// Prompt Label: "technical-context"
// Template Function:
return `Technical Context:
- You have access to code examples and technical documentation
- Provide code snippets when appropriate
- Use technical terminology accurately
- Current topic: ${params.topic || 'general programming'}`;
```

## Available Context Methods

The `context` object is automatically provided to all prompt templates and includes two methods:

1. **`context.getPrompt(label)`** - Returns the prompt entity by label
   ```javascript
   const promptEntity = context.getPrompt('base-instructions');
   if (promptEntity) {
     console.log(promptEntity.description);
   }
   ```

2. **`context.buildPrompt(label, params)`** - Builds another prompt and returns the result
   ```javascript
   const result = context.buildPrompt('base-instructions', {
     role: 'expert',
     style: 'concise'
   });
   ```

## Safety Features

- **Recursion Protection**: Maximum depth of 10 nested prompt calls
- **Error Handling**: Graceful handling of missing prompts
- **Synchronous Execution**: Simple, straightforward execution without async complexity

## Best Practices

1. **Keep prompts focused**: Each prompt should have a single responsibility
2. **Use parameters**: Make prompts reusable by accepting parameters
3. **Handle missing prompts**: Always check if referenced prompts exist
4. **Document dependencies**: List which prompts your template references
5. **Avoid circular references**: Be careful not to create infinite loops