import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Loader2,
  Terminal,
  Code2,
  CheckCircle2,
  AlertCircle,
  CornerDownLeft,
} from 'lucide-react';
import { AIStatusState } from './types';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  aiStatus?: AIStatusState;
  aiStatusMessage?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  aiStatus = 'idle',
  aiStatusMessage,
  disabled = false,
  placeholder = 'Tulis instruksi atau perbaikan untuk ArtaStudio AI (cth: "Pasang tombol glowing hexa di navbar")...',
  className = '',
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 180);
      textareaRef.current.style.height = `${Math.max(newHeight, 44)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || disabled || aiStatus !== 'idle') return;

    onSendMessage(input.trim());
    setInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Render AI Status badge & message
  const renderAIStatus = () => {
    switch (aiStatus) {
      case 'analyzing':
        return (
          <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span>{aiStatusMessage || 'Sedang menganalisis struktur kode...'}</span>
          </div>
        );
      case 'coding':
        return (
          <div className="flex items-center gap-2 text-xs text-violet-400 font-medium">
            <Code2 className="w-3.5 h-3.5 animate-pulse text-violet-400" />
            <span>{aiStatusMessage || 'Sedang menulis kode & membuat berkas...'}</span>
          </div>
        );
      case 'building':
        return (
          <div className="flex items-center gap-2 text-xs text-blue-400 font-medium">
            <Terminal className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>{aiStatusMessage || 'Menjalankan kompilasi & verifikasi build...'}</span>
          </div>
        );
      case 'deploying':
        return (
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
            <Sparkles className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            <span>{aiStatusMessage || 'Menyinkronkan pratinjau langsung...'}</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2 text-xs text-rose-400 font-medium">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>{aiStatusMessage || 'Gagal memproses respons AI'}</span>
          </div>
        );
      case 'idle':
      default:
        return (
          <div className="flex items-center gap-2 text-xs text-slate-400 font-normal">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
            <span>{aiStatusMessage || 'ArtaStudio AI siap menerima instruksi'}</span>
          </div>
        );
    }
  };

  const suggestions = [
    'Pasang tombol glowing hexa di navbar',
    'Perbaiki temuan kritis sensor error',
    'Tambahkan transisi smooth di preview viewport',
  ];

  const isBusy = aiStatus !== 'idle';
  const canSubmit = input.trim().length > 0 && !disabled && !isBusy;

  return (
    <div className={`p-3 sm:p-4 bg-slate-900/95 border-t border-slate-800 ${className}`}>
      {/* AI Status bar */}
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <div className="min-w-0">{renderAIStatus()}</div>

        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
          <span>Enter ↵</span>
          <span>kirim</span>
          <span className="text-slate-600">•</span>
          <span>Shift+Enter baris baru</span>
        </div>
      </div>

      {/* Suggestion Chips (when input is empty and AI is idle) */}
      {!input && !isBusy && (
        <div className="flex items-center gap-1.5 mb-2.5 overflow-x-auto pb-1 text-xs select-none no-scrollbar">
          <span className="text-[11px] text-slate-500 font-sans shrink-0">Saran:</span>
          {suggestions.map((sug, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSuggestionClick(sug)}
              className="px-2.5 py-1 rounded-full text-[11px] text-slate-300 bg-slate-800/80 hover:bg-slate-800 hover:text-amber-300 border border-slate-700/60 hover:border-amber-500/40 transition-all shrink-0 cursor-pointer"
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {/* Main Input Box */}
      <div className="relative flex items-end gap-2 p-2 rounded-xl border border-slate-700/80 bg-slate-950/80 focus-within:border-amber-500/60 focus-within:shadow-[0_0_12px_rgba(245,158,11,0.15)] transition-all">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isBusy}
          placeholder={isBusy ? 'AI sedang bekerja, harap tunggu...' : placeholder}
          rows={1}
          className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 resize-none outline-none leading-relaxed py-1 px-1.5 min-h-[44px] max-h-[180px] overflow-y-auto"
        />

        {/* Send Button */}
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={!canSubmit}
          aria-label="Kirim instruksi"
          className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all shrink-0 cursor-pointer ${
            canSubmit
              ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.4)] hover:shadow-[0_0_14px_rgba(245,158,11,0.6)] hover:brightness-110 active:scale-95'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
          }`}
          title="Kirim (Enter)"
        >
          {isBusy ? (
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};
