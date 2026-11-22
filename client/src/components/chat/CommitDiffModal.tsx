import React, { useState, useEffect } from 'react';
import {
  X,
  GitCommit,
  GitBranch,
  Copy,
  Check,
  Eye,
  FileCode,
  Plus,
  Minus,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { CommitItem, FileDiff } from './types';

interface CommitDiffModalProps {
  isOpen: boolean;
  commit: CommitItem | null;
  onClose: () => void;
  onPreviewCommit?: (commit: CommitItem) => void;
  isCurrentPreview?: boolean;
}

export const CommitDiffModal: React.FC<CommitDiffModalProps> = ({
  isOpen,
  commit,
  onClose,
  onPreviewCommit,
  isCurrentPreview = false,
}) => {
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [copiedHash, setCopiedHash] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Reset file index on commit change
  useEffect(() => {
    setSelectedFileIdx(0);
  }, [commit?.hash]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !commit) return null;

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(commit.hash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    } catch {
      // Fallback
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  // Mock diff if none provided
  const files: FileDiff[] = commit.diffSummary && commit.diffSummary.length > 0
    ? commit.diffSummary
    : [
        {
          path: 'src/components/layout/MobileSidebar.tsx',
          status: 'modified',
          additions: 18,
          deletions: 4,
          patch: `@@ -145,18 +145,24 @@ export const MobileSidebar = ({
-            orders: 'pembelian_karya',
+            orders: 'penjualan_karya',
+            penjualan_karya: 'penjualan_karya',
+            artworkSales: 'penjualan_karya',
+            myOrders: 'pembelian_karya',
@@ -363,7 +369,11 @@
-  <button className="ml-auto w-6 h-6 rounded-full">
+  <button
+    onClick={(e) => handleHexaHelp(e, 'dashboard')}
+    className="ml-auto flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/50 text-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.35)] hover:shadow-[0_0_12px_rgba(245,158,11,0.6)] animate-pulse"
+    title="Panduan Hexa"
+  >
+    <HelpCircle className="w-3.5 h-3.5" />
+  </button>`,
        },
        {
          path: 'tests/unit/hexaQuestAndTutorial.test.ts',
          status: 'modified',
          additions: 6,
          deletions: 0,
          patch: `@@ -111,6 +111,8 @@ describe('Hexa Daily Quest & Tutorial Link Logic', () => {
+      dailyQuests: 'toko_quest',
+      daily_quests: 'toko_quest',
+      toko_quest: 'toko_quest',`,
        },
      ];

  const currentFile = files[selectedFileIdx] || files[0];

  const renderDiffLines = (patch?: string) => {
    if (!patch) {
      return (
        <div className="p-8 text-center text-slate-400 text-xs font-mono">
          Perubahan biner atau tidak ada potongan teks diff yang dapat ditampilkan.
        </div>
      );
    }

    const lines = patch.split('\n');
    let oldLineNum = 1;
    let newLineNum = 1;

    return (
      <div className="font-mono text-xs divide-y divide-slate-800/40 select-text">
        {lines.map((line, idx) => {
          let lineType: 'hunk' | 'add' | 'del' | 'normal' = 'normal';
          let bgClass = 'bg-transparent text-slate-300';

          if (line.startsWith('@@')) {
            lineType = 'hunk';
            bgClass = 'bg-violet-950/30 text-violet-400 font-semibold py-1 px-3 border-y border-violet-900/30';
            const match = line.match(/@@ -(\d+).*?\+(\d+)/);
            if (match) {
              oldLineNum = parseInt(match[1], 10);
              newLineNum = parseInt(match[2], 10);
            }
          } else if (line.startsWith('+')) {
            lineType = 'add';
            bgClass = 'bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500';
          } else if (line.startsWith('-')) {
            lineType = 'del';
            bgClass = 'bg-rose-950/40 text-rose-300 border-l-2 border-rose-500';
          }

          const renderOldNum = lineType === 'hunk' ? '...' : lineType === 'add' ? '' : oldLineNum;
          const renderNewNum = lineType === 'hunk' ? '...' : lineType === 'del' ? '' : newLineNum;

          if (lineType === 'normal') {
            oldLineNum++;
            newLineNum++;
          } else if (lineType === 'add') {
            newLineNum++;
          } else if (lineType === 'del') {
            oldLineNum++;
          }

          if (lineType === 'hunk') {
            return (
              <div key={idx} className={bgClass}>
                {line}
              </div>
            );
          }

          return (
            <div key={idx} className={`flex items-stretch hover:bg-slate-800/30 ${bgClass}`}>
              {/* Line numbers */}
              <div className="w-10 py-0.5 px-2 text-right select-none text-[11px] text-slate-500/80 border-r border-slate-800/60 shrink-0">
                {renderOldNum}
              </div>
              <div className="w-10 py-0.5 px-2 text-right select-none text-[11px] text-slate-500/80 border-r border-slate-800/60 shrink-0">
                {renderNewNum}
              </div>
              {/* Marker (+ / -) */}
              <div className="w-6 py-0.5 text-center select-none shrink-0 font-bold">
                {lineType === 'add' ? (
                  <span className="text-emerald-400">+</span>
                ) : lineType === 'del' ? (
                  <span className="text-rose-400">-</span>
                ) : (
                  <span className="text-slate-600"> </span>
                )}
              </div>
              {/* Code line content */}
              <div className="py-0.5 px-2 overflow-x-auto whitespace-pre font-mono flex-1">
                {line.slice(1) || ' '}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="commit-diff-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className={`bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isMaximized ? 'w-full h-full' : 'w-full max-w-4xl max-h-[88vh] h-[750px]'
        }`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <GitCommit className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="commit-diff-title" className="text-sm font-bold text-white truncate max-w-md">
                  {commit.message}
                </h3>
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-slate-800 text-amber-300 border border-slate-700">
                  {commit.shortHash || commit.hash.slice(0, 7)}
                </span>
                {commit.branch && (
                  <span className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                    <GitBranch className="w-3 h-3 text-violet-400" />
                    {commit.branch}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                Oleh <span className="text-slate-300 font-medium">{commit.author}</span> • {commit.timestamp}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-3">
            <button
              type="button"
              onClick={handleCopyHash}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded border border-slate-700/70 transition-colors cursor-pointer"
              title="Salin Hash Commit Lengkap"
            >
              {copiedHash ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-[11px]">Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Salin Hash</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
              title={isMaximized ? 'Perkecil Ukuran' : 'Maksimalkan'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
              title="Tutup (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Stats Bar */}
        <div className="flex items-center justify-between px-5 py-2 bg-slate-950/40 border-b border-slate-800/80 text-xs shrink-0">
          <div className="flex items-center gap-4 text-slate-400">
            <span>
              <strong className="text-slate-200">{files.length}</strong> berkas berubah
            </span>
            <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
              <Plus className="w-3.5 h-3.5" />
              <span>{commit.additions ?? files.reduce((acc, f) => acc + f.additions, 0)} baris</span>
            </div>
            <div className="flex items-center gap-1.5 text-rose-400 font-mono text-[11px]">
              <Minus className="w-3.5 h-3.5" />
              <span>{commit.deletions ?? files.reduce((acc, f) => acc + f.deletions, 0)} baris</span>
            </div>
          </div>

          {onPreviewCommit && (
            <button
              type="button"
              onClick={() => onPreviewCommit(commit)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                isCurrentPreview
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.25)] hover:bg-amber-500/30'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{isCurrentPreview ? 'Pratinjau Sedang Aktif' : 'Pratinjau Versi Ini'}</span>
            </button>
          )}
        </div>

        {/* Modal Body: File list sidebar + Diff viewer */}
        <div className="flex-1 flex overflow-hidden">
          {/* File Selector Sidebar */}
          <div className="w-64 border-r border-slate-800 bg-slate-950/30 overflow-y-auto divide-y divide-slate-800/40 shrink-0">
            <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Daftar Berkas ({files.length})
            </div>
            {files.map((file, idx) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedFileIdx(idx)}
                className={`w-full text-left px-3 py-2.5 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                  selectedFileIdx === idx
                    ? 'bg-amber-500/10 text-amber-300 border-l-2 border-amber-400'
                    : 'text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="text-xs font-mono truncate" title={file.path}>
                    {file.path.split('/').pop()}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono shrink-0">
                  <span className="text-emerald-400">+{file.additions}</span>
                  <span className="text-rose-400">-{file.deletions}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Diff Content Area */}
          <div className="flex-1 flex flex-col bg-slate-950/50 overflow-hidden">
            {/* Active file sub-header */}
            <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between text-xs font-mono text-slate-300 shrink-0">
              <span className="truncate">{currentFile.path}</span>
              <span className="text-[11px] text-slate-500">
                +{currentFile.additions} / -{currentFile.deletions}
              </span>
            </div>

            {/* Scrollable code diff */}
            <div className="flex-1 overflow-auto bg-slate-950/70 p-1">
              {renderDiffLines(currentFile.patch)}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-950/80 shrink-0">
          <span className="text-xs text-slate-400 font-mono">
            ID: {commit.hash}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
