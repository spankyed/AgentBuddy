import React, { useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { Message } from '../types';

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
}

const ChatArea: React.FC<ChatAreaProps> = ({ messages, onSendMessage }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-80 min-h-[20rem] bg-white border-t border-neutral-200">
      <div className="flex-grow overflow-y-auto">
        <div className="divide-y divide-neutral-100">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <ChatInput onSendMessage={onSendMessage} />
    </div>
  );
};

export default ChatArea;