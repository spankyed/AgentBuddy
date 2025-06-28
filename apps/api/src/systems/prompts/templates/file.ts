// <backend.ts>
//  ...
// </backend.ts>
import { PromptTemplate, registerPromptTemplate } from '../types';

// Legacy function for backward compatibility
export function file(filename: string, content: string) {
	return `
<${filename}>
${content}
</${filename}>
`;
}

// New prompt template definition
export const filePromptTemplate: PromptTemplate = {
  id: 'file-content',
  name: 'File Content',
  description: 'Wraps content in file tags for structured context',
  category: 'code',
  
  // Declare expected inputs
  inputs: {
    filename: {
      name: 'filename',
      type: 'string',
      description: 'The name of the file',
      required: true,
      example: 'backend.ts'
    },
    content: {
      name: 'content',
      type: 'string', 
      description: 'The content of the file',
      required: true,
      example: 'const server = express();'
    }
  },
  
  templateFn: (params) => {
    const { filename, content } = params;
    return `
<${filename}>
${content}
</${filename}>
`;
  },
  
  example: {
    input: {
      filename: 'backend.ts',
      content: 'const server = express();'
    },
    output: `
<backend.ts>
const server = express();
</backend.ts>
`
  }
};

// Register the template
registerPromptTemplate(filePromptTemplate);

// ? when saving a prompt - save the template and (an AI generated) example
