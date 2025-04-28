import React from 'react';
import { 
  LayoutGrid, 
  Code, 
  Box, 
  Folder, 
  ChevronRight, 
  Star, 
  BarChart2, 
  Settings
} from 'lucide-react';

interface ToolbarProps {
  activeItem: string;
  onSelectItem: (item: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ activeItem, onSelectItem }) => {
  const toolbarItems = [
    { id: 'dashboard', icon: <LayoutGrid size={24} />, label: 'Dashboard' },
    { id: 'code', icon: <Code size={24} />, label: 'Code' },
    { id: 'components', icon: <Box size={24} />, label: 'Components' },
    { id: 'files', icon: <Folder size={24} />, label: 'Files' },
    { id: 'terminal', icon: <ChevronRight size={24} />, label: 'Terminal' },
    { id: 'favorites', icon: <Star size={24} />, label: 'Favorites' },
    { id: 'analytics', icon: <BarChart2 size={24} />, label: 'Analytics' },
    { id: 'settings', icon: <Settings size={24} />, label: 'Settings' },
  ];

  return (
    <div className="flex flex-col h-full bg-primary-800 text-white py-4 w-16">
      <div className="flex flex-col items-center space-y-6">
        {toolbarItems.map((item) => (
          <button
            key={item.id}
            className={`p-2 rounded-lg transition-all duration-200 ease-in-out ${
              activeItem === item.id
                ? 'bg-primary-600 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-primary-700'
            }`}
            onClick={() => onSelectItem(item.id)}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Toolbar;