import React from 'react';
import { ContextItem as ContextItemType } from '../types';
import ContextItem from './ContextItem';
import { X } from 'lucide-react';

interface ContextPanelProps {
  items: ContextItemType[];
  onClose?: () => void;
}

const ContextPanel: React.FC<ContextPanelProps> = ({ items, onClose }) => {
  return (
    <div className="w-96 bg-neutral-900 border-l border-neutral-700 flex flex-col h-full">
      <div className="p-4 border-b border-neutral-700 flex items-center justify-between">
        <h2 className="font-medium text-primary-800">Context Inspection</h2>
        {onClose && (
          <button 
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-200"
          >
            <X size={18} />
          </button>
        )}
      </div>
      
      <div className="flex-grow overflow-y-auto p-4">
        {items.map((item) => (
          <ContextItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
};

export default ContextPanel;