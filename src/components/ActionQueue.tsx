import React from 'react';
import { ActionItem } from '../types';
import ActionQueueItem from './ActionQueueItem';
import { List, MinusCircle } from 'lucide-react';

interface ActionQueueProps {
  actions: ActionItem[];
  onClear?: () => void;
}

const ActionQueue: React.FC<ActionQueueProps> = ({ actions, onClear }) => {
  const activeCount = actions.filter(a => a.status === 'in-progress').length;
  const pendingCount = actions.filter(a => a.status === 'pending').length;

  return (
    <div className="border-t border-neutral-700 bg-neutral-800">
      <div className="p-3 flex items-center justify-between border-b border-neutral-700">
        <div className="flex items-center">
          <List size={16} className="text-neutral-300 mr-2" />
          <h3 className="text-sm font-medium text-neutral-100">Action Queue</h3>
          {(activeCount > 0 || pendingCount > 0) && (
            <div className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-primary-100 text-primary-800">
              {activeCount} active, {pendingCount} pending
            </div>
          )}
        </div>
        
        {onClear && (
          <button 
            onClick={onClear}
            className="text-xs flex items-center text-neutral-500 hover:text-neutral-200"
          >
            <MinusCircle size={14} className="mr-1" />
            Clear completed
          </button>
        )}
      </div>
      
      <div className="max-h-64 overflow-y-auto p-3">
        {actions.map((action) => (
          <ActionQueueItem key={action.id} action={action} />
        ))}
      </div>
    </div>
  );
};

export default ActionQueue;