import React, { useState } from 'react';
import { User, Sparkles, Copy, Check, Bot } from 'lucide-react';
import { ChatMessage } from './types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  className?: string;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  message,
  className = '',
}) => {
  const isUser = message.sender === 'user';
  const isSystem = message.sender === 'system';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isSystem) {
    return (
      <div className={`my-2 text-center ${className}`}>
        <span className="inline-block px-3 py-1 text-[11px] font-mono text-slate-400 bg-slate-900/80 rounded-full border border-slate-800">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`group my-3 flex gap-3 ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      } ${className}`}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        {isUser ? (
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 shadow-sm">
            <User className="w-4 h-4" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 via-violet-500/20 to-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.25)]">
            <Sparkles className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Message Container */}
      <div
        className={`max-w-[85%] sm:max-w-[80%] flex flex-col ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        {/* Name and Timestamp Header */}
        <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-slate-400">
          <span className="font-medium text-slate-300">
            {isUser ? 'Anda' : 'ArtaStudio AI'}
          </span>
          <span className="text-slate-600">•</span>
          <span>{message.timestamp}</span>
          {message.metadata?.model && (
            <>
              <span className="text-slate-600">•</span>
              <span className="font-mono text-[10px] text-violet-400 bg-violet-950/40 px-1.5 py-0.2 rounded border border-violet-900/40">
                {message.metadata.model}
              </span>
            </>
          )}
        </div>

        {/* Message Bubble */}
        <div
          className={`relative p-3.5 rounded-2xl shadow-md leading-relaxed text-xs transition-all ${
            isUser
              ? 'bg-gradient-to-br from-slate-800 to-slate-850 text-slate-100 border border-slate-700/80 rounded-tr-sm'
              : 'bg-slate-900/90 text-slate-200 border border-slate-800 rounded-tl-sm w-full'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed select-text font-sans">
              {message.content}
            </p>
          ) : (
            <MarkdownRenderer
              content={message.content}
              isStreaming={message.isStreaming}
            />
          )}

          {/* Quick Copy Action (on hover) */}
          {!message.isStreaming && (
            <div
              className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity`}
            >
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 rounded bg-slate-800/80 hover:bg-slate-750 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
                title="Salin Pesan"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
