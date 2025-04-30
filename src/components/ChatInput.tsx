import React, { useState } from 'react';
import { Send, Mic, PaperclipIcon } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <form 
      onSubmit={handleSubmit}
      className="border-t border-neutral-700 p-4 bg-neutral-800"
    >
      <div className="relative flex items-center">
        <button
          type="button"
          className="absolute left-3 text-neutral-500 hover:text-neutral-200 transition-colors"
          aria-label="Attach file"
        >
          <PaperclipIcon size={20} />
        </button>
        
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message AI Assistant..."
          className="w-full py-3 px-10 bg-neutral-800 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 transition-all"
        />
        
        <button
          type="button"
          className="absolute right-14 text-neutral-500 hover:text-neutral-200 transition-colors"
          aria-label="Voice input"
        >
          <Mic size={20} />
        </button>
        
        <button
          type="submit"
          disabled={!message.trim()}
          className={`absolute right-3 ${
            message.trim() 
              ? 'text-primary-500 hover:text-primary-600' 
              : 'text-neutral-400'
          } transition-colors`}
          aria-label="Send message"
        >
          <Send size={20} />
        </button>
      </div>
    </form>
  );
};

export default ChatInput;