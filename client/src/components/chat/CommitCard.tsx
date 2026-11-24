import React from 'react';
import {
  GitCommit,
  GitBranch,
  FileCode,
  Eye,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { CommitItem } from './types';

interface CommitCardProps {
  commit: CommitItem;
  onViewDetail: (commit: CommitItem) => void;
  onPreview: (commit: CommitItem) => void;
  isCurrentPreview?: boolean;
  className?: string;
}

export const CommitCard: React.FC<CommitCardProps> = ({
  commit,
  onViewDetail,
  onPreview,
  isCurrentPreview = false,
  className = '',
}) => {
  const shortHash = commit.shortHash || commit.hash.slice(0, 7);
  const additions = commit.additions ?? 14;
  const deletions = commit.deletions ?? 3;
  const filesChanged = commit.filesChanged ?? 2;

  return (
    <div
      className={`my-3 rounded-xl border border-slate-800 bg-slate-900/90 shadow-lg p-3.5 sm:p-4 transition-all duration-200 hover:border-slate-700 hover:shadow-xl hover:shadow-amber-500/5 ${className}`}
    >
      {/* Top Bar: Icon, Branch, Hash, Timestamp */}
      <div className="flex items-center justify-between gap-2 mb-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Hexa-styled Git Commit Icon Badge */}
          <div className="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)] shrink-0">
            <GitCommit className="w-3.5 h-3.5" />
          </div>

          {/* Commit Hash Badge */}
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-800/90 text-amber-300 border border-slate-700/70 shrink-0">
            {shortHash}
          </span>

          {/* GitHub Sync Badge (Standar Lovable Image 2) */}
          {(commit.isGitHubSync || commit.source === 'github') && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold text-emerald-300 bg-emerald-950/70 border border-emerald-500/40 px-2 py-0.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.15)] shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>GitHub Sync</span>
            </span>
          )}

          {/* Branch Tag */}
          {commit.branch && (
            <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400 bg-slate-800/50 px-2 py-0.5 rounded border border-slate-800 shrink-0">
              <GitBranch className="w-3 h-3 text-violet-400" />
              <span>{commit.branch}</span>
            </span>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-[11px] text-slate-400 shrink-0 font-sans">
          {commit.timestamp}
        </span>
      </div>

      {/* Commit Title / Message */}
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-white tracking-tight flex items-start gap-1.5 leading-snug">
          <span>{commit.message}</span>
        </h4>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
          <span className="text-[11px]">
            Oleh <strong className="text-slate-300 font-medium">{commit.author}</strong>
          </span>
          <span className="text-slate-600">•</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-emerald-400">+{additions}</span>
            <span className="text-rose-400">-{deletions}</span>
            <span className="text-slate-500">({filesChanged} berkas)</span>
          </div>
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/80 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {/* Detail Button (Diff Modal) */}
          <button
            type="button"
            onClick={() => onViewDetail(commit)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg border border-slate-700/80 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <FileCode className="w-3.5 h-3.5 text-violet-400" />
            <span>Detail</span>
          </button>

          {/* Preview Button */}
          <button
            type="button"
            onClick={() => onPreview(commit)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-sm active:scale-95 ${
              isCurrentPreview
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                : 'bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 hover:border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
            }`}
          >
            {isCurrentPreview ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sedang Ditampilkan</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                <span>Pratinjau</span>
              </>
            )}
          </button>
        </div>

        {/* Hint or quick diff count */}
        <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500">
          <span>Riwayat tersimpan</span>
          <ChevronRight className="w-3 h-3 text-slate-600" />
        </div>
      </div>
    </div>
  );
};
