import React, { useState } from 'react';
import Toolbar from './components/Toolbar';
import CanvasArea from './components/CanvasArea';
import ChatArea from './components/ChatArea';
import ContextPanel from './components/ContextPanel';
import ActionQueue from './components/ActionQueue';
import { Message, ActionItem } from './types';
import { mockMessages, mockActions, mockContextItems, mockCanvasContent } from './data/mockData';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './hooks/useTheme';

function App() {
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [actions, setActions] = useState<ActionItem[]>(mockActions);
  const [activeToolbarItem, setActiveToolbarItem] = useState('code');
  const [theme, setTheme] = useTheme();

  const handleSendMessage = (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: new Date()
    };
    
    setMessages([...messages, newMessage]);
    
    // Simulate a new action
    const newAction: ActionItem = {
      id: Date.now().toString(),
      description: 'Processing your request...',
      status: 'in-progress',
      timestamp: new Date()
    };
    
    setActions([...actions, newAction]);
    
    // Simulate assistant response after a short delay
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm analyzing your request to rewrite the code with CSS variables. Give me a moment to prepare a response.",
        role: 'assistant',
        timestamp: new Date()
      };
      
      setMessages((prevMessages) => [...prevMessages, assistantMessage]);
      
      // Update the action status
      setActions((prevActions) => 
        prevActions.map(action => 
          action.id === newAction.id 
            ? { ...action, status: 'completed', description: 'Analyzed code structure' } 
            : action
        )
      );
    }, 1000);
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const handleClearCompletedActions = () => {
    setActions(actions.filter(a => a.status !== 'completed'));
  };

  return (
    <div className={`h-screen flex flex-col ${theme === 'dark' ? 'dark' : ''}`}>
      {/* Header with Action Buttons */}
      <div className="bg-neutral-800 border-b border-neutral-700 p-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          {mockActions.slice(0, 6).map(action => (
            <button 
              key={action.id}
              className="py-1.5 px-3 text-sm font-medium bg-neutral-800 border border-neutral-300 rounded-full hover:bg-neutral-900 transition-colors"
            >
              {action.description}
            </button>
          ))}
        </div>
        
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-neutral-800 transition-colors"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
      </div>
      
      <div className="flex-grow flex overflow-hidden">
        {/* Left Toolbar */}
        <Toolbar 
          activeItem={activeToolbarItem} 
          onSelectItem={setActiveToolbarItem} 
        />
        
        {/* Main Content Area */}
        <div className="flex-grow flex flex-col overflow-hidden">
          {/* Canvas Area */}
          <CanvasArea content={mockCanvasContent} />
          
          {/* Chat Area */}
          <ChatArea 
            messages={messages}
            onSendMessage={handleSendMessage}
          />
          
          {/* Action Queue */}
          {/* <ActionQueue 
            actions={actions}
            onClear={handleClearCompletedActions}
          /> */}
        </div>
        
        {/* Context Panel */}
        <ContextPanel items={mockContextItems} />
      </div>
    </div>
  );
}

export default App;