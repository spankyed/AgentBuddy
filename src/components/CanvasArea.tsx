import React from 'react';
import { CanvasContent } from '../types';
import { Copy } from 'lucide-react';

interface CanvasAreaProps {
  content: CanvasContent;
}

const CanvasArea: React.FC<CanvasAreaProps> = ({ content }) => {
  let renderedContent;
  
  switch (content.type) {
    case 'code':
      renderedContent = (
        <div className="relative">
          <pre className="bg-neutral-900 text-white p-6 rounded-lg font-mono text-sm overflow-x-auto">
            <code>{content.content}</code>
          </pre>
          <button 
            className="absolute top-3 right-3 p-2 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white transition-colors"
            title="Copy to clipboard"
          >
            <Copy size={16} />
          </button>
        </div>
      );
      break;
    case 'text':
      renderedContent = <div className="prose">{content.content}</div>;
      break;
    case 'image':
      renderedContent = <img src={content.content as string} alt="Canvas content" className="max-w-full h-auto" />;
      break;
    default:
      renderedContent = <div className="text-center py-8 text-neutral-500">No content to display</div>;
  }

  return (
    <div className="flex-grow bg-neutral-100 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="text-center text-neutral-500 uppercase text-xs tracking-wider mb-6">Canvas</div>
        <div className="bg-white rounded-lg shadow-md p-6 animate-fade-in">
          {renderedContent}
        </div>
        
        {content.type === 'code' && (
          <div className="mt-4 p-4 border border-neutral-300 rounded-lg bg-white">
            <p className="text-sm text-neutral-600 italic">please rewrite this code using css variables from our design systems</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CanvasArea;