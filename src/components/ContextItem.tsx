import React, { useState } from 'react';
import { ContextItem as ContextItemType } from '../types';
import { ChevronDown, ChevronUp, Copy } from 'lucide-react';

interface ContextItemProps {
  item: ContextItemType;
}

const ContextItem: React.FC<ContextItemProps> = ({ item }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="mb-3 bg-neutral-800 rounded-lg shadow-sm border border-neutral-700 overflow-hidden">
      <div 
        className="px-4 py-3 flex items-center justify-between cursor-pointer"
        onClick={toggleExpand}
      >
        <h3 className="font-medium text-sm">{item.title}</h3>
        <button className="text-neutral-500">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      
      {isExpanded && (
        <div className="p-4 border-t border-neutral-700 animate-slide-down">
          {item.type === 'code' ? (
            <div className="relative">
              <pre className="bg-neutral-900 text-white p-3 rounded text-xs font-mono overflow-x-auto">
                <code>{item.content}</code>
              </pre>
              <button 
                className="absolute top-2 right-2 p-1 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white transition-colors"
                title="Copy to clipboard"
              >
                <Copy size={14} />
              </button>
            </div>
          ) : (
            <p className="text-sm text-neutral-200">{item.content}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ContextItem;