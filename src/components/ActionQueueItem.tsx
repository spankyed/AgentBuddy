import React from 'react';
import { ActionItem } from '../types';
import { CheckCircle, Clock, Loader, XCircle } from 'lucide-react';

interface ActionQueueItemProps {
  action: ActionItem;
}

const ActionQueueItem: React.FC<ActionQueueItemProps> = ({ action }) => {
  const getStatusIcon = () => {
    switch (action.status) {
      case 'completed':
        return <CheckCircle size={16} className="text-success-400" />;
      case 'in-progress':
        return <Loader size={16} className="text-warning-400 animate-spin" />;
      case 'failed':
        return <XCircle size={16} className="text-error-400" />;
      case 'pending':
      default:
        return <Clock size={16} className="text-neutral-400" />;
    }
  };
  
  const getStatusClass = () => {
    switch (action.status) {
      case 'completed':
        return 'bg-success-100 border-success-200';
      case 'in-progress':
        return 'bg-warning-50 border-warning-200';
      case 'failed':
        return 'bg-error-50 border-error-200';
      case 'pending':
      default:
        return 'bg-neutral-800 border-neutral-700';
    }
  };

  return (
    <div className={`p-3 rounded-lg mb-2 border ${getStatusClass()} animate-fade-in transition-colors`}>
      <div className="flex items-center">
        <span className="mr-2">
          {getStatusIcon()}
        </span>
        <span className="text-sm font-medium text-neutral-100">
          {action.description}
        </span>
        <span className="ml-auto text-xs text-neutral-500">
          {new Date(action.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      </div>
    </div>
  );
};

export default ActionQueueItem;