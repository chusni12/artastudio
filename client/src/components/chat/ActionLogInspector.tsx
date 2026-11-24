import React, { useState, useEffect } from 'react';
import {
  Terminal,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  Code,
  Edit3,
} from 'lucide-react';
import type { AIActionLog } from './types';

export interface ActionLogInspectorProps {
  actionLogs?: AIActionLog[];
  status?: string;
  statusMessage?: string;
  isLatestAssistant?: boolean;
  defaultOpen?: boolean;
  className?: string;
}

export const ActionLogInspector: React.FC<ActionLogInspectorProps> = ({
  actionLogs = [],
  status,
  statusMessage,
  isLatestAssistant = false,
  defaultOpen = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  // Global shortcut ctrl+o / cmd+o toggle for the latest active assistant message
  useEffect(() => {
    if (!isLatestAssistant) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLatestAssistant]);

  // Expand automatically if action is currently actively running
  const isActivelyRunning =
    status === 'editing' ||
    status === 'thinking' ||
    actionLogs.some((l) => l.status === 'running') ||
    Boolean(statusMessage && statusMessage.toLowerCase().includes('aksi:'));

  // Synthetic log item if currently running action but logs haven't arrived yet
  const effectiveLogs: AIActionLog[] =
    actionLogs.length > 0
      ? actionLogs
      : isActivelyRunning
      ? [
          {
            id: 'running_action_placeholder',
            type: statusMessage?.toLowerCase().includes('read')
              ? 'read'
              : statusMessage?.toLowerCase().includes('edit')
              ? 'edit'
              : statusMessage?.toLowerCase().includes('write')
              ? 'write'
              : 'shell',
            command: statusMessage || 'Menjalankan operasi terminal...',
            output: undefined,
            timestamp: new Date().toISOString(),
            status: 'running',
          },
        ]
      : [];

  const totalActions = effectiveLogs.length;
  if (totalActions === 0 && !isActivelyRunning) {
    return null;
  }

  // Summary counts
  const shellCount = effectiveLogs.filter((l) => l.type === 'shell').length;
  const readCount = effectiveLogs.filter((l) => l.type === 'read').length;
  const writeEditCount = effectiveLogs.filter((l) => l.type === 'edit' || l.type === 'write').length;

  const handleCopyCommand = async (e: React.MouseEvent, text: string, id: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(id);
      setTimeout(() => setCopiedIndex(null), 1800);
    } catch {}
  };

  const handleCopyAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const dump = effectiveLogs
        .map((l, i) => {
          return `[Action #${i + 1} - ${l.type.toUpperCase()}] status: ${l.status}\n$ ${l.command || ''}\n${
            l.output ? 'Output:\n' + l.output : ''
          }\n`;
        })
        .join('\n----------------------------------------\n\n');
      await navigator.clipboard.writeText(dump);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {}
  };

  const renderTypeBadge = (type: AIActionLog['type']) => {
    switch (type) {
      case 'shell':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 shadow-xs">
            <Terminal className="w-2.5 h-2.5" />
            SHELL
          </span>
        );
      case 'read':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-sky-950/80 text-sky-400 border border-sky-700/60 shadow-xs">
            <FileText className="w-2.5 h-2.5" />
            READ
          </span>
        );
      case 'edit':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-950/80 text-amber-400 border border-amber-700/60 shadow-xs">
            <Edit3 className="w-2.5 h-2.5" />
            EDIT
          </span>
        );
      case 'write':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-purple-950/80 text-purple-400 border border-purple-700/60 shadow-xs">
            <Code className="w-2.5 h-2.5" />
            WRITE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700 shadow-xs">
            INFO
          </span>
        );
    }
  };

  const renderStatusPill = (itemStatus: AIActionLog['status']) => {
    switch (itemStatus) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400 font-medium">
            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
            running...
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-400 font-medium">
            <XCircle className="w-3 h-3 text-rose-400" />
            failed
          </span>
        );
      case 'success':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 font-medium">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            success
          </span>
        );
    }
  };

  return (
    <div className={`mt-2 w-full transition-all ${className}`}>
      {/* Interactive Collapsible Header Box (Ala Orca / Lovable) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full group text-left px-3 py-2 rounded-xl border flex items-center justify-between gap-2.5 text-xs transition-all cursor-pointer ${
          isOpen
            ? 'bg-slate-900/95 border-amber-500/50 shadow-md ring-1 ring-amber-500/20'
            : isActivelyRunning
            ? 'bg-slate-900/80 border-amber-500/40 hover:bg-slate-850 hover:border-amber-400/60 shadow-sm animate-pulse'
            : 'bg-slate-900/60 border-slate-800 hover:bg-slate-850 hover:border-slate-700 shadow-xs'
        }`}
        title="Klik untuk membuka inspector log aksi (ctrl+o)"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 group-hover:bg-amber-500/20 transition-colors">
            {isActivelyRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <span className="text-xs">⚙️</span>
            )}
          </span>

          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-slate-200 group-hover:text-amber-300 transition-colors truncate">
              {isActivelyRunning
                ? `⚙️ Sedang Menjalankan Aksi (${totalActions} Aksi)`
                : `⚙️ ${totalActions} Aksi Dijalankan`}
            </span>
            <span className="text-slate-500 text-[11px] hidden sm:inline">•</span>
            <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">
              Klik untuk melihat log <span className="font-mono text-[10px] text-amber-400/90">(ctrl+o)</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Quick Stat Badges */}
          <div className="hidden md:flex items-center gap-1 text-[10px] font-mono text-slate-400">
            {shellCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                {shellCount} shell
              </span>
            )}
            {readCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-sky-950/60 text-sky-400 border border-sky-800/40">
                {readCount} read
              </span>
            )}
            {writeEditCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/40">
                {writeEditCount} edit
              </span>
            )}
          </div>

          <span className="text-slate-400 group-hover:text-slate-200 transition-transform duration-200">
            {isOpen ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </div>
      </button>

      {/* Expanded Terminal Log Drawer */}
      {isOpen && (
        <div className="mt-2 rounded-xl bg-[#090d16] border border-slate-800/90 overflow-hidden shadow-2xl transition-all animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Terminal Titlebar */}
          <div className="px-3 py-2 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <span className="font-mono text-[11px] font-semibold text-slate-300 ml-1">
                TERMINAL / TOOL EXECUTION LOGS
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyAll}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[11px] font-mono text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer"
                title="Salin seluruh riwayat log aksi"
              >
                {copiedAll ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Salin Semua</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Action Log Entries List */}
          <div className="divide-y divide-slate-850/80 max-h-96 overflow-y-auto">
            {effectiveLogs.map((log, index) => (
              <div key={log.id || index} className="p-3 hover:bg-slate-900/30 transition-colors">
                {/* Meta Row: Type Badge + Status + Timestamp */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    {renderTypeBadge(log.type)}
                    {renderStatusPill(log.status)}
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {new Date(log.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>

                {/* Command Bar: Prominent $ ... */}
                <div className="group/cmd flex items-start justify-between gap-2 bg-black/60 rounded-lg p-2 border border-slate-850 mb-2">
                  <div className="flex items-start gap-1.5 font-mono text-xs break-all min-w-0">
                    <span className="text-emerald-400 font-bold select-none">$</span>
                    <span className="text-slate-100 font-medium select-all">
                      {log.command || '(perintah tidak tercatat)'}
                    </span>
                  </div>

                  {log.command && (
                    <button
                      type="button"
                      onClick={(e) => handleCopyCommand(e, log.command!, `cmd_${log.id}`)}
                      className="opacity-60 group-hover/cmd:opacity-100 p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 transition-opacity cursor-pointer shrink-0"
                      title="Salin Perintah"
                    >
                      {copiedIndex === `cmd_${log.id}` ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>

                {/* Output Console Box */}
                {log.output ? (
                  <div className="relative">
                    <div className="flex items-center justify-between px-2 py-1 bg-black/80 rounded-t-lg border-t border-x border-slate-800/80 text-[10px] font-mono text-slate-400">
                      <span>HASIL EKSEKUSI / OUTPUT</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyCommand(e, log.output!, `out_${log.id}`)}
                        className="hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                        title="Salin Output"
                      >
                        {copiedIndex === `out_${log.id}` ? (
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-2.5 h-2.5" />
                        )}
                        <span>Salin Output</span>
                      </button>
                    </div>
                    <pre className="p-2.5 rounded-b-lg bg-black text-slate-300 font-mono text-[11px] leading-relaxed border-b border-x border-slate-800/80 max-h-48 overflow-y-auto whitespace-pre-wrap select-text">
                      {log.output}
                    </pre>
                  </div>
                ) : log.status === 'running' ? (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-black/50 border border-slate-850 text-[11px] font-mono text-amber-300/80 italic">
                    <Loader2 className="w-3 h-3 animate-spin text-amber-400 shrink-0" />
                    <span>Eksekusi perintah sedang berlangsung di terminal sistem...</span>
                  </div>
                ) : (
                  <div className="text-[10px] font-mono text-slate-500 italic px-1">
                    ✓ Perintah selesai dieksekusi (exit code 0, tanpa stdout).
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};