import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  GitCommit,
  GitBranch,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  ArrowDown,
  Filter,
} from 'lucide-react';
import {
  ChatMessage,
  CommitItem,
  SensorErrorItem,
  TimelineItem,
  ChatPanelProps,
  AIStatusState,
} from './types';
import { ChatMessageBubble } from './ChatMessageBubble';
import { CommitCard } from './CommitCard';
import { ErrorSensorBanner } from './ErrorSensorBanner';
import { ChatInput } from './ChatInput';
import { CommitDiffModal } from './CommitDiffModal';

// Rich initial demo state if props are omitted
const DEFAULT_INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    sender: 'user',
    content: 'Tolong pasang tombol glowing hexa di seluruh item menu sidebar dan pastikan lolos unit test.',
    timestamp: '18:28',
  },
  {
    id: 'msg-2',
    sender: 'assistant',
    content: `Baik! Saya telah menganalisis struktur sidebar di \`src/components/layout/MobileSidebar.tsx\` dan membuat perubahan yang diperlukan:

1. Menambahkan tombol glowing hexa seragam dengan styling amber gold dan efek pulsing glow.
2. Memperbarui pemetaan rute fitur hexa tutorial (\`dailyQuests\`, \`toko_quest\`, dll).
3. Menambahkan pengujian unit lengkap di \`tests/unit/hexaQuestAndTutorial.test.ts\`.

Berikut adalah ringkasan perubahan yang telah dikomit ke git:`,
    timestamp: '18:29',
    metadata: {
      model: 'ArtaStudio Code v2.5',
      tokens: 420,
      responseTimeMs: 850,
    },
  },
];

const DEFAULT_INITIAL_COMMITS: CommitItem[] = [
  {
    id: 'cmt-1',
    hash: '7181ecc9128757b29c793ea3fcb6f5d7812ddd5c',
    shortHash: '7181ecc',
    message: 'feat: pasang tombol glowing hexa seragam di seluruh item menu sidebar',
    author: 'ArtaStudio Agent',
    timestamp: '3 menit lalu',
    branch: 'studio-mod8-chat',
    filesChanged: 2,
    additions: 76,
    deletions: 4,
    diffSummary: [
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
+            'my-orders': 'pembelian_karya',
@@ -363,7 +369,7 @@ export const MobileSidebar = ({
-  className="ml-auto flex items-center justify-center w-6 h-6 rounded-full"
+  className="ml-auto flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/50 text-amber-500 dark:text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.35)] hover:shadow-[0_0_12px_rgba(245,158,11,0.6)] hover:bg-amber-500/25 transition-all animate-pulse"`,
      },
      {
        path: 'tests/unit/hexaQuestAndTutorial.test.ts',
        status: 'modified',
        additions: 58,
        deletions: 0,
        patch: `@@ -155,6 +160,64 @@ describe('Hexa Daily Quest & Tutorial Link Logic', () => {
+  it('verifies all sidebar menu keys map to valid Hexa tutorial features', () => {
+    const sidebarKeysToExpectedFeature: Record<string, string> = {
+      dashboard: 'dashboard',
+      item_saya: 'item_saya',
+      myArtworks: 'karya_saya',
+      dailyQuests: 'toko_quest',
+    };
+    expect(sidebarKeysToExpectedFeature.dashboard).toBe('dashboard');
+  });`,
      },
    ],
    isCurrentPreview: false,
  },
];

const DEFAULT_INITIAL_ERRORS: SensorErrorItem[] = [
  {
    id: 'err-1',
    type: 'compile',
    title: 'TypeScript Type Mismatch',
    message: "Type 'string' is not assignable to type 'HexaFeatureKey' at MobileSidebar.tsx line 142",
    file: 'src/components/layout/MobileSidebar.tsx',
    line: 142,
    column: 15,
    stack: `Error: TS2322: Type 'string' is not assignable to type 'HexaFeatureKey'.
    at checkType (src/components/layout/MobileSidebar.tsx:142:15)
    at Object.validate (node_modules/typescript/lib/tsc.js:84210)
    at ViteBuildSensorPlugin (studio/server/services/errorSensorService.ts:48)`,
    timestamp: '18:30:12',
    autoFixPrompt: "Tolong perbaiki temuan kritis: Type 'string' is not assignable to type 'HexaFeatureKey' di berkas src/components/layout/MobileSidebar.tsx:142",
  },
];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages: controlledMessages,
  commits: controlledCommits,
  timelineItems: controlledTimelineItems,
  activeErrors: controlledErrors,
  activePreviewCommitHash: controlledActivePreviewHash,
  aiStatus: controlledAiStatus,
  aiStatusMessage: controlledAiStatusMessage,
  onSendMessage,
  onAutoFixError,
  onViewCommitDetail,
  onPreviewCommit,
  onClearErrors,
  onClearChat,
  projectName = 'ArtaLoka Studio',
  currentBranch = 'studio-mod8-chat',
  className = '',
}) => {
  // Internal state when uncontrolled
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>(DEFAULT_INITIAL_MESSAGES);
  const [internalCommits, setInternalCommits] = useState<CommitItem[]>(DEFAULT_INITIAL_COMMITS);
  const [internalErrors, setInternalErrors] = useState<SensorErrorItem[]>(DEFAULT_INITIAL_ERRORS);
  const [activePreviewHash, setActivePreviewHash] = useState<string>('7181ecc');
  const [aiStatus, setAiStatus] = useState<AIStatusState>(controlledAiStatus || 'idle');
  const [aiStatusMessage, setAiStatusMessage] = useState<string | undefined>(controlledAiStatusMessage);

  // Active diff modal commit state
  const [inspectingCommit, setInspectingCommit] = useState<CommitItem | null>(null);

  // Filter mode: 'all' | 'chat_only' | 'commits_only'
  const [filterMode, setFilterMode] = useState<'all' | 'chat_only' | 'commits_only'>('all');

  // Auto-scroll ref
  const feedEndRef = useRef<HTMLDivElement>(null);
  const feedContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Sync controlled props if provided
  const messages = controlledMessages !== undefined ? controlledMessages : internalMessages;
  const commits = controlledCommits !== undefined ? controlledCommits : internalCommits;
  const errors = controlledErrors !== undefined ? controlledErrors : internalErrors;
  const currentPreviewHash = controlledActivePreviewHash !== undefined ? controlledActivePreviewHash : activePreviewHash;

  useEffect(() => {
    if (controlledAiStatus) {
      setAiStatus(controlledAiStatus);
    }
  }, [controlledAiStatus]);

  useEffect(() => {
    if (controlledAiStatusMessage !== undefined) {
      setAiStatusMessage(controlledAiStatusMessage);
    }
  }, [controlledAiStatusMessage]);

  // Combine into timeline feed
  const timeline: TimelineItem[] = useMemo(() => {
    if (controlledTimelineItems) {
      return controlledTimelineItems;
    }

    const items: TimelineItem[] = [];

    // Add messages
    if (filterMode !== 'commits_only') {
      messages.forEach((msg) => {
        items.push({ type: 'message', data: msg });
      });
    }

    // Add commits
    if (filterMode !== 'chat_only') {
      commits.forEach((cmt) => {
        items.push({ type: 'commit', data: cmt });
      });
    }

    return items;
  }, [controlledTimelineItems, messages, commits, filterMode]);

  // Auto scroll to bottom
  const scrollToBottom = (smooth = true) => {
    feedEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    scrollToBottom(false);
  }, [messages.length, commits.length]);

  // Scroll listener to toggle floating "Scroll to bottom" button
  const handleScroll = () => {
    if (!feedContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedContainerRef.current;
    const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 150;
    setShowScrollBottom(isFarFromBottom);
  };

  // Handlers
  const handleSend = (text: string) => {
    if (onSendMessage) {
      onSendMessage(text);
      return;
    }

    // Default internal handler for interactive demo
    const userMsgId = `msg-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    setInternalMessages((prev) => [...prev, userMsg]);
    setAiStatus('analyzing');
    setAiStatusMessage('Sedang membaca instruksi...');

    // Simulate AI pipeline
    setTimeout(() => {
      setAiStatus('coding');
      setAiStatusMessage('Menerapkan perubahan kode...');

      setTimeout(() => {
        setAiStatus('building');
        setAiStatusMessage('Memverifikasi perubahan kode via git...');

        setTimeout(() => {
          // Generate new commit
          const newHash = Math.random().toString(16).substring(2, 9);
          const newCommit: CommitItem = {
            id: `cmt-${Date.now()}`,
            hash: `${newHash}489a2bc`,
            shortHash: newHash,
            message: `feat: implementasi ${text.slice(0, 35)}`,
            author: 'ArtaStudio Agent',
            timestamp: 'Baru saja',
            branch: currentBranch,
            filesChanged: 1,
            additions: 12,
            deletions: 2,
            diffSummary: [
              {
                path: 'src/components/studio/feature.tsx',
                status: 'modified',
                additions: 12,
                deletions: 2,
                patch: `@@ -1,5 +1,15 @@\n+ // Perubahan diterapkan oleh ArtaStudio AI\n+ export const GlowingFeature = () => <div className="p-4" />;`,
              },
            ],
            isCurrentPreview: false,
          };

          const aiMsg: ChatMessage = {
            id: `ai-msg-${Date.now()}`,
            sender: 'assistant',
            content: `Saya telah menyelesaikan instruksi: **"${text}"**.\n\nPerubahan telah dikomit ke git dengan hash \`${newHash}\`. Anda dapat meninjau kode melalui tombol **[Detail]** atau langsung mengaktifkan versi ini di **[Pratinjau]**.`,
            timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            metadata: {
              model: 'ArtaStudio Code v2.5',
            },
          };

          setInternalCommits((prev) => [...prev, newCommit]);
          setInternalMessages((prev) => [...prev, aiMsg]);
          setAiStatus('idle');
          setAiStatusMessage(undefined);
        }, 1000);
      }, 1000);
    }, 800);
  };

  const handleAutoFix = (error: SensorErrorItem) => {
    if (onAutoFixError) {
      onAutoFixError(error);
      return;
    }

    // Default internal auto fix simulation
    const prompt = error.autoFixPrompt || `Tolong perbaiki temuan kritis ini: ${error.message} di ${error.file || 'kode'}`;
    handleSend(prompt);

    // Clear resolved error
    setTimeout(() => {
      setInternalErrors((prev) => prev.filter((e) => e.id !== error.id));
    }, 2500);
  };

  const handleViewDetail = (commit: CommitItem) => {
    if (onViewCommitDetail) {
      onViewCommitDetail(commit);
    }
    setInspectingCommit(commit);
  };

  const handlePreview = (commit: CommitItem) => {
    const hash = commit.shortHash || commit.hash.slice(0, 7);
    setActivePreviewHash(hash);
    if (onPreviewCommit) {
      onPreviewCommit(commit);
    }
  };

  const handleDismissError = (errorId?: string) => {
    if (onClearErrors) {
      onClearErrors();
      return;
    }
    if (errorId) {
      setInternalErrors((prev) => prev.filter((e) => e.id !== errorId));
    } else {
      setInternalErrors([]);
    }
  };

  const handleClearHistory = () => {
    if (onClearChat) {
      onClearChat();
      return;
    }
    setInternalMessages([]);
    setInternalCommits([]);
  };

  return (
    <div
      className={`flex flex-col h-full bg-slate-950 text-slate-100 border-x border-slate-800/80 overflow-hidden ${className}`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800/90 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Brand Logo Hexa Icon */}
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.4)] shrink-0 font-bold">
            <Sparkles className="w-4 h-4 text-slate-950" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-white tracking-wide uppercase truncate">
                {projectName}
              </h2>
              {/* Branch tag */}
              <span className="flex items-center gap-1 font-mono text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60 shrink-0">
                <GitBranch className="w-3 h-3 text-violet-400" />
                <span>{currentBranch}</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span>Chat & Commit Timeline</span>
            </p>
          </div>
        </div>

        {/* Right Status Badges & Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Commits Badge */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/60 text-[11px] text-slate-300 font-mono"
            title="Total riwayat commit pada sesi ini"
          >
            <GitCommit className="w-3 h-3 text-amber-400" />
            <span>{commits.length} Commit</span>
          </div>

          {/* Sensor Error Status Indicator */}
          {errors.length > 0 ? (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-rose-500/15 border border-rose-500/40 text-[11px] text-rose-300 font-semibold animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>{errors.length} Temuan Kritis</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Sensor Normal</span>
            </div>
          )}

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => {
              setFilterMode((prev) =>
                prev === 'all' ? 'commits_only' : prev === 'commits_only' ? 'chat_only' : 'all'
              );
            }}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
            title={`Filter Tampilan: ${
              filterMode === 'all' ? 'Semua' : filterMode === 'commits_only' ? 'Hanya Commit' : 'Hanya Chat'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
          </button>

          {/* Clear chat */}
          <button
            type="button"
            onClick={handleClearHistory}
            className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
            title="Bersihkan Percakapan"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Timeline Feed Container */}
      <div
        ref={feedContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 relative select-text"
      >
        {timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-500 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-500/80 shadow-[0_0_16px_rgba(245,158,11,0.15)]">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Belum Ada Percakapan</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Mulai dengan mengirimkan instruksi di bawah untuk mengubah kode atau membuat fitur baru.
              </p>
            </div>
          </div>
        ) : (
          timeline.map((item, idx) => {
            if (item.type === 'message') {
              return <ChatMessageBubble key={item.data.id || `msg-${idx}`} message={item.data} />;
            }
            if (item.type === 'commit') {
              const shortHash = item.data.shortHash || item.data.hash.slice(0, 7);
              const isCurrent = currentPreviewHash === shortHash || currentPreviewHash === item.data.hash;
              return (
                <CommitCard
                  key={item.data.id || `cmt-${idx}`}
                  commit={item.data}
                  onViewDetail={handleViewDetail}
                  onPreview={handlePreview}
                  isCurrentPreview={isCurrent}
                />
              );
            }
            if (item.type === 'error') {
              return (
                <ErrorSensorBanner
                  key={item.data.id || `err-${idx}`}
                  errors={[item.data]}
                  onAutoFix={handleAutoFix}
                  onDismiss={handleDismissError}
                />
              );
            }
            return null;
          })
        )}

        <div ref={feedEndRef} />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-32 right-6 p-2 rounded-full bg-slate-800/90 text-amber-400 border border-amber-500/40 shadow-lg hover:bg-slate-750 transition-all cursor-pointer animate-bounce"
          title="Gulir ke Pesan Terbaru"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Pinned Error Sensor Banner (above input box when active errors exist) */}
      {errors.length > 0 && (
        <div className="px-3 pt-2 pb-0 shrink-0">
          <ErrorSensorBanner
            errors={errors}
            onAutoFix={handleAutoFix}
            onDismiss={handleDismissError}
          />
        </div>
      )}

      {/* Bottom Chat Input */}
      <ChatInput
        onSendMessage={handleSend}
        aiStatus={aiStatus}
        aiStatusMessage={aiStatusMessage}
      />

      {/* Commit Diff Modal */}
      <CommitDiffModal
        isOpen={inspectingCommit !== null}
        commit={inspectingCommit}
        onClose={() => setInspectingCommit(null)}
        onPreviewCommit={handlePreview}
        isCurrentPreview={
          inspectingCommit
            ? currentPreviewHash === inspectingCommit.shortHash ||
              currentPreviewHash === inspectingCommit.hash
            : false
        }
      />
    </div>
  );
};

export default ChatPanel;
