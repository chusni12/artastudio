import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Layers,
  FolderGit2,
  Folder,
  FolderTree,
  FileCode,
  Terminal,
  Settings,
  Share2,
  CloudUpload,
  GitBranch,
  Play,
  Square,
  RotateCw,
  ExternalLink,
  Smartphone,
  Tablet,
  Monitor,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Plus,
  Search,
  Send,
  Paperclip,
  Bot,
  User,
  GitCommit,
  AlertTriangle,
  CheckCircle2,
  X,
  Activity,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  Code2,
  Eye,
  MessageSquare,
  Check,
  Copy,
  Zap,
  RefreshCw,
  Wifi,
  Sliders,
  ShieldCheck,
  Cpu,
  ArrowUpRight,
} from 'lucide-react';
import {
  DeviceMode,
  WorkspaceItem,
  GitBranchItem,
  DevServerStatus,
  StudioCommit,
  StudioChatMessage,
  StudioTimelineItem,
  StudioLayoutProps,
} from './types';

// Default initial workspaces
const DEFAULT_WORKSPACES: WorkspaceItem[] = [
  {
    id: 'ws-1',
    name: 'artaloka-marketplace',
    description: 'Platform Pasar Seni Digital & NFT Berbasis Web3 & Cloudflare',
    techStack: 'React 19 • Vite • Tailwind v4 • Cloudflare Workers',
    updatedAt: 'Baru saja',
    branch: 'studio-mod7-layout',
    isActive: true,
  },
  {
    id: 'ws-2',
    name: 'studio-canvas-core',
    description: 'Mesin Editor Gambar & Vector Canvas ArtaStudio',
    techStack: 'React • Canvas2D • WebGL 2.0',
    updatedAt: '2 jam lalu',
    branch: 'main',
  },
  {
    id: 'ws-3',
    name: 'seniman-portal-v2',
    description: 'Portal Portofolio & Ruang Pameran Seniman Indonesia',
    techStack: 'React • Supabase • Edge KV',
    updatedAt: 'Kemarin',
    branch: 'feat/galeri-seniman',
  },
];

// Default initial git branches
const DEFAULT_BRANCHES: GitBranchItem[] = [
  { name: 'main', isDefault: true, lastCommit: 'c4967bc8', updatedAt: '1 jam lalu' },
  { name: 'studio-mod7-layout', lastCommit: '7a21df90', updatedAt: 'Baru saja' },
  { name: 'feat/checkout-edge', lastCommit: '3ae02da8', updatedAt: '3 jam lalu' },
  { name: 'patch/obsidian-theme', lastCommit: '8910be11', updatedAt: '5 jam lalu' },
];

// Default dev server state
const DEFAULT_DEV_SERVER: DevServerStatus = {
  status: 'running',
  port: 5173,
  url: 'http://localhost:5173',
  uptime: '02:45:18',
  latencyMs: 14,
  requestsCount: 342,
};

// Default initial chat conversation & commits feed
const DEFAULT_TIMELINE_ITEMS: StudioTimelineItem[] = [
  {
    type: 'message',
    data: {
      id: 'msg-1',
      sender: 'user',
      content:
        'Halo ArtaStudio AI! Tolong rancang antarmuka modern khas ArtaStudio dengan tema obsidian dark slate, aksen amber & violet, serta integrasi tombol One-Click Publish ke Cloudflare Edge.',
      timestamp: '18:15',
    },
  },
  {
    type: 'message',
    data: {
      id: 'msg-2',
      sender: 'assistant',
      content:
        'Siap! Saya telah mengonfigurasi ArtaStudio UI Layout Shell:\n\n1. Tema Obsidian Slate (`#0B0F17`) dengan aksen Amber Gold & Violet Glow.\n2. Kolom Kiri: Sidebar Proyek, Navigasi Git & Dev Server Monitor.\n3. Kolom Tengah: Chat Workspace & Live Commit Feed.\n4. Kolom Kanan: Live Preview Viewport dengan Device Switcher (Desktop, Tablet, Mobile).\n5. Header Toolbar: Branch Switcher, Bagikan, dan Tombol "Publikasikan ke Edge".',
      timestamp: '18:16',
      model: 'Arta AI 3.7 Sonnet',
      suggestedAction: 'Lihat live preview di panel kanan',
    },
  },
  {
    type: 'commit',
    data: {
      id: 'cmt-1',
      hash: '7a21df90e381',
      shortHash: '7a21df9',
      message: 'feat(ui): kerangka layout 3-kolom tema obsidian slate khas ArtaStudio',
      author: 'ArtaStudio Agent',
      timestamp: '18:22',
      branch: 'studio-mod7-layout',
      filesChanged: 4,
      additions: 382,
      deletions: 12,
    },
  },
  {
    type: 'message',
    data: {
      id: 'msg-3',
      sender: 'assistant',
      content:
        'Perubahan telah dikompilasi secara otomatis ke Dev Server lokal (port 5173). Preview viewport telah diperbarui.',
      timestamp: '18:23',
      model: 'Arta AI 3.7 Sonnet',
    },
  },
];

// Mock Project File Tree for Sidebar Explorer
const MOCK_FILES = [
  { name: 'studio', isFolder: true, open: true, children: [
    { name: 'client', isFolder: true, open: true, children: [
      { name: 'src', isFolder: true, open: true, children: [
        { name: 'components', isFolder: true, open: true, children: [
          { name: 'layout', isFolder: true, open: true, children: [
            { name: 'StudioLayout.tsx', status: 'M', isFile: true },
            { name: 'types.ts', status: 'A', isFile: true },
          ]},
          { name: 'chat', isFolder: true, open: false, children: [] },
          { name: 'preview', isFolder: true, open: false, children: [] },
        ]},
        { name: 'styles.css', status: 'M', isFile: true },
        { name: 'main.tsx', isFile: true },
      ]},
      { name: 'package.json', isFile: true },
      { name: 'vite.config.ts', isFile: true },
    ]},
    { name: 'server', isFolder: true, open: false, children: [] },
  ]},
];

export const StudioLayout: React.FC<StudioLayoutProps> = ({
  projectName = 'artaloka-marketplace',
  projectDescription = 'Platform Pasar Seni Digital Berbasis Edge Cloud',
  activeWorkspaceId = 'ws-1',
  workspaces = DEFAULT_WORKSPACES,
  onWorkspaceChange,
  onNewWorkspace,
  currentBranch = 'studio-mod7-layout',
  branches = DEFAULT_BRANCHES,
  onBranchChange,
  onCreateBranch,
  devServerStatus = DEFAULT_DEV_SERVER,
  onRestartDevServer,
  onStopDevServer,
  onPublishToEdge,
  onShare,
  isPublishing = false,
  chatPanel,
  timelineItems = DEFAULT_TIMELINE_ITEMS,
  onSendMessage,
  isAiThinking = false,
  previewPanel,
  previewUrl = 'http://localhost:5173',
  onRefreshPreview,
  sidebarPanel,
  className = '',
}) => {
  // Navigation & Viewport State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeNavTab, setActiveNavTab] = useState<'files' | 'git' | 'edge' | 'terminal' | 'settings'>('files');
  const [activeWorkspace, setActiveWorkspace] = useState(
    workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0] || DEFAULT_WORKSPACES[0]
  );
  const [activeBranchState, setActiveBranchState] = useState(currentBranch);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [isIframeRefreshing, setIsIframeRefreshing] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Mobile layout switcher (Chat vs Preview) for small screens
  const [mobileActiveTab, setMobileActiveTab] = useState<'chat' | 'preview'>('chat');

  // Resizable Divider State (Chat vs Preview split percentage)
  const [splitRatio, setSplitRatio] = useState<number>(45); // 45% Chat, 55% Preview
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Modals & Popovers State
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [publishStep, setPublishStep] = useState<number>(0);
  const [publishedEdgeUrl, setPublishedEdgeUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Internal Chat State (if no custom chatPanel is provided)
  const [chatFeed, setChatFeed] = useState<StudioTimelineItem[]>(timelineItems);
  const [promptInput, setPromptInput] = useState('');
  const [serverState, setServerState] = useState<DevServerStatus>(devServerStatus);
  const [isServerRestarting, setIsServerRestarting] = useState(false);

  // Keep branch state in sync with prop if changed
  useEffect(() => {
    setActiveBranchState(currentBranch);
  }, [currentBranch]);

  // Sync devServerStatus
  useEffect(() => {
    setServerState(devServerStatus);
  }, [devServerStatus]);

  // Sync timelineItems
  useEffect(() => {
    setChatFeed(timelineItems);
  }, [timelineItems]);

  // Resizable Divider Mouse & Touch Handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingDivider(true);
  }, []);

  const handleTouchStart = useCallback(() => {
    setIsDraggingDivider(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingDivider || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const newRatio = (relativeX / rect.width) * 100;
      // Clamp split ratio between 25% and 75%
      const clamped = Math.max(25, Math.min(75, newRatio));
      setSplitRatio(clamped);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingDivider || !containerRef.current || !e.touches[0]) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.touches[0].clientX - rect.left;
      const newRatio = (relativeX / rect.width) * 100;
      const clamped = Math.max(25, Math.min(75, newRatio));
      setSplitRatio(clamped);
    };

    const handleMouseUp = () => {
      if (isDraggingDivider) {
        setIsDraggingDivider(false);
      }
    };

    if (isDraggingDivider) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDraggingDivider]);

  // Handle Refresh Preview
  const triggerRefreshPreview = () => {
    setIsIframeRefreshing(true);
    setIframeKey((prev) => prev + 1);
    if (onRefreshPreview) {
      onRefreshPreview();
    }
    setTimeout(() => {
      setIsIframeRefreshing(false);
    }, 600);
  };

  // Handle Restart Dev Server
  const handleRestartServer = () => {
    setIsServerRestarting(true);
    setServerState((prev) => ({ ...prev, status: 'starting' }));
    if (onRestartDevServer) {
      onRestartDevServer();
    }
    setTimeout(() => {
      setServerState((prev) => ({
        ...prev,
        status: 'running',
        uptime: '00:00:01',
        latencyMs: Math.floor(Math.random() * 10 + 10),
      }));
      setIsServerRestarting(false);
      triggerRefreshPreview();
    }, 1200);
  };

  // Handle Send Prompt
  const handleSendPromptSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = promptInput.trim();
    if (!trimmed) return;

    if (onSendMessage) {
      onSendMessage(trimmed);
    } else {
      // Local fallback simulation
      const newMsg: StudioTimelineItem = {
        type: 'message',
        data: {
          id: `msg-${Date.now()}`,
          sender: 'user',
          content: trimmed,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      };
      setChatFeed((prev) => [...prev, newMsg]);

      // Simulated AI auto-reply
      setTimeout(() => {
        const replyMsg: StudioTimelineItem = {
          type: 'message',
          data: {
            id: `msg-${Date.now() + 1}`,
            sender: 'assistant',
            content: `Menganalisis permintaan: "${trimmed}". Menyusun patch kode dan menyinkronkan ke dev server...`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            model: 'Arta AI 3.7 Sonnet',
          },
        };
        const commitMsg: StudioTimelineItem = {
          type: 'commit',
          data: {
            id: `cmt-${Date.now() + 2}`,
            hash: Math.random().toString(16).substring(2, 10),
            shortHash: Math.random().toString(16).substring(2, 9),
            message: `feat(studio): update components based on user prompt`,
            author: 'ArtaStudio Agent',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            branch: activeBranchState,
            filesChanged: 2,
            additions: 45,
            deletions: 4,
          },
        };
        setChatFeed((prev) => [...prev, replyMsg, commitMsg]);
        triggerRefreshPreview();
      }, 1000);
    }

    setPromptInput('');
  };

  // Handle One-Click Publish to Edge
  const handleStartPublish = async () => {
    setShowPublishModal(true);
    setPublishStep(1); // Building bundle
    setPublishedEdgeUrl('');

    if (onPublishToEdge) {
      try {
        await onPublishToEdge();
      } catch {
        // Handled in callback
      }
    }

    // Step progression animation
    setTimeout(() => {
      setPublishStep(2); // Packaging Cloudflare Worker
    }, 1200);

    setTimeout(() => {
      setPublishStep(3); // Deploying to Edge (280+ PoPs)
    }, 2400);

    setTimeout(() => {
      setPublishStep(4); // Finished
      const edgeSlug = activeWorkspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      setPublishedEdgeUrl(`https://${edgeSlug}.artaloka.workers.dev`);
    }, 3800);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden bg-[#090D16] text-slate-100 font-sans select-none ${className}`}
    >
      {/* =========================================================================
          TOP HEADER BAR
          - Brand Logo ArtaStudio (Obsidian & Amber/Violet glow)
          - Active Project Indicator
          - Git Branch Switcher Dropdown
          - "Bagikan" Button
          - "Publikasikan ke Edge" (One-Click Publish) Primary Action
          ========================================================================= */}
      <header className="h-14 bg-[#0B0F17]/95 border-b border-slate-800/80 backdrop-blur-md px-3.5 flex items-center justify-between z-30 shrink-0">
        {/* Left Section: Brand Logo + Sidebar Toggle + Active Workspace Indicator */}
        <div className="flex items-center gap-3">
          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label={sidebarOpen ? 'Tutup Sidebar' : 'Buka Sidebar'}
            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 rounded-md transition-colors"
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>

          {/* ArtaStudio Brand Title & Icon */}
          <div className="flex items-center gap-2 pr-3 border-r border-slate-800/80">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 via-amber-600 to-violet-600 flex items-center justify-center shadow-[0_0_12px_rgba(245,158,11,0.35)]">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-sm tracking-tight bg-gradient-to-r from-amber-400 via-amber-200 to-violet-400 bg-clip-text text-transparent">
                ArtaStudio
              </span>
              <span className="text-[10px] uppercase font-semibold text-violet-400 tracking-wider px-1 py-0.2 rounded bg-violet-500/10 border border-violet-500/20">
                IDE
              </span>
            </div>
          </div>

          {/* Active Workspace / Project Indicator with Dropdown Switcher */}
          <div className="relative">
            <button
              onClick={() => {
                setShowWorkspaceMenu((prev) => !prev);
                setShowBranchMenu(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 hover:text-white transition-all group"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
              <span className="font-semibold text-slate-100 max-w-[140px] truncate">{activeWorkspace.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400 transition-colors" />
            </button>

            {/* Workspace Switcher Menu Dropdown */}
            {showWorkspaceMenu && (
              <div className="absolute left-0 top-full mt-1.5 w-72 rounded-lg bg-[#0F172A] border border-slate-700/80 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Pilih Workspace Proyek</span>
                  <span className="text-[10px] text-amber-400 font-normal">{workspaces.length} Aktif</span>
                </div>
                <div className="mt-1 space-y-1">
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => {
                        setActiveWorkspace(ws);
                        setShowWorkspaceMenu(false);
                        if (onWorkspaceChange) onWorkspaceChange(ws.id);
                      }}
                      className={`w-full text-left p-2 rounded-md transition-colors flex items-start gap-2.5 ${
                        ws.id === activeWorkspace.id
                          ? 'bg-amber-500/15 border border-amber-500/30 text-amber-200'
                          : 'hover:bg-slate-800/70 text-slate-300'
                      }`}
                    >
                      <Folder className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate flex items-center justify-between">
                          <span>{ws.name}</span>
                          {ws.id === activeWorkspace.id && <Check className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                        {ws.description && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{ws.description}</div>
                        )}
                        <div className="text-[9px] text-slate-500 mt-1 flex items-center gap-1.5">
                          <GitBranch className="w-2.5 h-2.5 text-slate-400" />
                          <span>{ws.branch}</span>
                          <span>•</span>
                          <span>{ws.updatedAt}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-2 pt-1.5 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setShowWorkspaceMenu(false);
                      if (onNewWorkspace) onNewWorkspace();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Proyek Baru</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Git Branch Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowBranchMenu((prev) => !prev);
                setShowWorkspaceMenu(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 text-xs text-slate-300 hover:text-slate-100 transition-all group"
            >
              <GitBranch className="w-3.5 h-3.5 text-violet-400" />
              <span className="font-mono text-[11px] max-w-[130px] truncate">{activeBranchState}</span>
              <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-violet-400 transition-colors" />
            </button>

            {/* Branch Switcher Menu */}
            {showBranchMenu && (
              <div className="absolute left-0 top-full mt-1.5 w-64 rounded-lg bg-[#0F172A] border border-slate-700/80 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Cabang Git Aktif
                </div>
                <div className="mt-1 space-y-1">
                  {branches.map((b) => (
                    <button
                      key={b.name}
                      onClick={() => {
                        setActiveBranchState(b.name);
                        setShowBranchMenu(false);
                        if (onBranchChange) onBranchChange(b.name);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors flex items-center justify-between ${
                        b.name === activeBranchState
                          ? 'bg-violet-500/15 border border-violet-500/30 text-violet-300'
                          : 'hover:bg-slate-800/70 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <GitBranch className="w-3 h-3 text-violet-400 shrink-0" />
                        <span className="truncate">{b.name}</span>
                        {b.isDefault && (
                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded">default</span>
                        )}
                      </div>
                      {b.name === activeBranchState && <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
                    </button>
                  ))}
                </div>

                <div className="mt-2 pt-1.5 border-t border-slate-800">
                  <button
                    onClick={() => {
                      const newBranch = prompt('Masukkan nama cabang git baru:');
                      if (newBranch && newBranch.trim()) {
                        setActiveBranchState(newBranch.trim());
                        setShowBranchMenu(false);
                        if (onCreateBranch) onCreateBranch(newBranch.trim());
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 border border-violet-500/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Buat Cabang Baru</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center / Responsive Device Tabs (Visible on small screens) */}
        <div className="md:hidden flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => setMobileActiveTab('chat')}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              mobileActiveTab === 'chat'
                ? 'bg-gradient-to-r from-amber-500/20 to-violet-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Chat AI
          </button>
          <button
            onClick={() => setMobileActiveTab('preview')}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              mobileActiveTab === 'preview'
                ? 'bg-gradient-to-r from-amber-500/20 to-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Live Preview
          </button>
        </div>

        {/* Right Section: Share Button + One-Click Publish Primary Action */}
        <div className="flex items-center gap-2.5">
          {/* "Bagikan" (Share) Button */}
          <button
            onClick={() => {
              setShowShareModal(true);
              if (onShare) onShare();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-200 hover:text-white transition-all shadow-xs"
          >
            <Share2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Bagikan</span>
          </button>

          {/* Tombol Utama: "Publikasikan ke Edge" (One-Click Publish) */}
          <button
            onClick={handleStartPublish}
            disabled={isPublishing}
            className="relative group overflow-hidden flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 via-amber-600 to-violet-600 hover:from-amber-400 hover:to-violet-500 text-white text-xs font-semibold shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_22px_rgba(139,92,246,0.5)] transition-all transform active:scale-95 disabled:opacity-50"
          >
            <CloudUpload className="w-4 h-4 text-amber-100 group-hover:scale-110 transition-transform" />
            <span className="tracking-tight">Publikasikan ke Edge</span>
            <div className="absolute inset-0 bg-white/15 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </button>
        </div>
      </header>

      {/* =========================================================================
          MAIN 3-COLUMN WORKSPACE BODY
          - Kolom Kiri: Project Navigation Sidebar
          - Kolom Tengah: Chat Workspace Panel
          - Resizable Divider
          - Kolom Kanan: Live Preview Viewport
          ========================================================================= */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {/* =====================================================================
            KOLOM KIRI: SIDEBAR NAVIGASI PROYEK
            - Workspace details
            - Navigation icon rail (Files, Git, Edge, Terminal, Settings)
            - File Explorer Tree preview
            - Dev Server Status Monitor with Restart/Stop controls
            ===================================================================== */}
        {sidebarOpen && (
          <aside
            className={`w-64 bg-[#0B0F17] border-r border-slate-800/80 flex flex-col shrink-0 transition-all duration-200 z-20 ${
              sidebarPanel ? '' : ''
            }`}
          >
            {sidebarPanel ? (
              sidebarPanel
            ) : (
              <>
                {/* Sidebar Navigation Tabs Rail */}
                <div className="h-10 border-b border-slate-800/80 flex items-center px-2 bg-slate-950/40 justify-between">
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setActiveNavTab('files')}
                      title="File Explorer"
                      className={`p-1.5 rounded transition-colors ${
                        activeNavTab === 'files'
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      <FolderTree className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setActiveNavTab('git')}
                      title="Git Versioning & Commits"
                      className={`p-1.5 rounded transition-colors ${
                        activeNavTab === 'git'
                          ? 'text-violet-400 bg-violet-500/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      <FolderGit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setActiveNavTab('edge')}
                      title="Cloudflare Edge Configuration"
                      className={`p-1.5 rounded transition-colors ${
                        activeNavTab === 'edge'
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      <Globe className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setActiveNavTab('terminal')}
                      title="Terminal & Sensor Logs"
                      className={`p-1.5 rounded transition-colors ${
                        activeNavTab === 'terminal'
                          ? 'text-violet-400 bg-violet-500/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      <Terminal className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => setActiveNavTab('settings')}
                    title="Pengaturan Proyek"
                    className={`p-1.5 rounded transition-colors ${
                      activeNavTab === 'settings'
                        ? 'text-amber-400 bg-amber-500/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>

                {/* Sidebar Main Content (File Explorer Tree) */}
                <div className="flex-1 overflow-y-auto p-3 text-xs">
                  {activeNavTab === 'files' && (
                    <div>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                        <span>Penjelajah Berkas</span>
                        <span className="text-[9px] font-mono text-slate-500">Vite React</span>
                      </div>

                      {/* Mock File Tree rendering */}
                      <div className="space-y-1 font-mono text-[11px] text-slate-300">
                        <div className="flex items-center gap-1.5 py-1 px-1.5 rounded bg-slate-900/60 text-slate-200">
                          <ChevronDown className="w-3 h-3 text-amber-400" />
                          <Folder className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-semibold">studio</span>
                        </div>
                        <div className="pl-4 space-y-1">
                          <div className="flex items-center gap-1.5 py-0.5 text-slate-300">
                            <ChevronDown className="w-3 h-3 text-amber-400/80" />
                            <Folder className="w-3.5 h-3.5 text-amber-400/80" />
                            <span>client</span>
                          </div>
                          <div className="pl-4 space-y-1">
                            <div className="flex items-center gap-1.5 py-0.5 text-slate-300">
                              <ChevronDown className="w-3 h-3 text-violet-400" />
                              <Folder className="w-3.5 h-3.5 text-violet-400" />
                              <span>src</span>
                            </div>
                            <div className="pl-4 space-y-0.5">
                              <div className="flex items-center gap-1.5 py-0.5 text-slate-300">
                                <ChevronDown className="w-3 h-3 text-violet-400/80" />
                                <Folder className="w-3.5 h-3.5 text-violet-400/80" />
                                <span>components</span>
                              </div>
                              <div className="pl-4 space-y-0.5">
                                <div className="flex items-center gap-1.5 py-0.5 text-slate-300">
                                  <ChevronDown className="w-3 h-3 text-amber-400" />
                                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                                  <span>layout</span>
                                </div>
                                <div className="pl-4 space-y-0.5">
                                  <div className="flex items-center justify-between py-1 px-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold">
                                    <div className="flex items-center gap-1.5 truncate">
                                      <FileCode className="w-3 h-3 text-amber-400" />
                                      <span className="truncate">StudioLayout.tsx</span>
                                    </div>
                                    <span className="text-[9px] px-1 bg-amber-500/30 text-amber-200 rounded">M</span>
                                  </div>
                                  <div className="flex items-center justify-between py-0.5 px-1.5 rounded text-slate-400 hover:text-slate-200">
                                    <div className="flex items-center gap-1.5 truncate">
                                      <FileCode className="w-3 h-3 text-slate-400" />
                                      <span className="truncate">types.ts</span>
                                    </div>
                                    <span className="text-[9px] px-1 bg-emerald-500/30 text-emerald-300 rounded">
                                      A
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeNavTab === 'git' && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                        Status Repositori Git
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Cabang Saat Ini:</span>
                          <span className="font-mono text-violet-400 font-semibold">{activeBranchState}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Perubahan Staged:</span>
                          <span className="font-mono text-emerald-400 font-semibold">2 Berkas</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Sinkronisasi Cloud:</span>
                          <span className="text-amber-400 text-[10px]">Tersambung</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeNavTab === 'edge' && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                        Cloudflare Global Edge
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
                        <div className="text-[11px] text-slate-300 font-semibold flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-amber-400" />
                          <span>Edge Worker Runner</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Siap dipublikasikan ke jaringan Cloudflare di 280+ lokasi edge dunia.
                        </p>
                        <div className="pt-1 text-[10px] font-mono text-violet-400">wrangler.jsonc: Terkonfigurasi</div>
                      </div>
                    </div>
                  )}

                  {activeNavTab === 'terminal' && (
                    <div className="space-y-2 font-mono text-[10px]">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Sensor Log</div>
                      <div className="p-2 bg-slate-950 rounded border border-slate-800 text-emerald-400 space-y-1">
                        <div>[Sensor] Error Sensor Modul 3: Standby</div>
                        <div>[Build] Vite HMR connected</div>
                        <div>[Edge] Mock preview router ready</div>
                      </div>
                    </div>
                  )}

                  {activeNavTab === 'settings' && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                        Preferensi ArtaStudio
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="text-slate-300">Tema Obsidian Dark</span>
                          <span className="text-amber-400 text-[10px] font-semibold">Aktif</span>
                        </label>
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="text-slate-300">Auto Live Preview HMR</span>
                          <span className="text-violet-400 text-[10px] font-semibold">Aktif</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sidebar Footer: Dev Server Status Monitor */}
                <div className="p-3 bg-[#080C14] border-t border-slate-800/80">
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            serverState.status === 'running'
                              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                              : serverState.status === 'starting'
                              ? 'bg-amber-400 animate-ping'
                              : 'bg-rose-500'
                          }`}
                        />
                        <span className="text-xs font-semibold text-slate-200">
                          {serverState.status === 'running'
                            ? 'Dev Server Aktif'
                            : serverState.status === 'starting'
                            ? 'Memulai Server...'
                            : 'Dev Server Mati'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">Port {serverState.port}</span>
                    </div>

                    <div className="text-[10px] text-slate-400 flex items-center justify-between font-mono">
                      <span>Latensi: {serverState.latencyMs}ms</span>
                      <span>Uptime: {serverState.uptime}</span>
                    </div>

                    <div className="pt-1.5 border-t border-slate-800/80 flex items-center gap-1.5">
                      <button
                        onClick={handleRestartServer}
                        disabled={isServerRestarting}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-medium transition-colors"
                      >
                        <RotateCw className={`w-3 h-3 ${isServerRestarting ? 'animate-spin text-amber-400' : ''}`} />
                        <span>Restart</span>
                      </button>
                      <button
                        onClick={() => {
                          setServerState((prev) => ({
                            ...prev,
                            status: prev.status === 'running' ? 'stopped' : 'running',
                          }));
                          if (onStopDevServer) onStopDevServer();
                        }}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 text-[11px] transition-colors"
                        title={serverState.status === 'running' ? 'Hentikan Server' : 'Jalankan Server'}
                      >
                        {serverState.status === 'running' ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 text-emerald-400" />}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </aside>
        )}

        {/* =====================================================================
            KOLOM TENGAH: CHAT WORKSPACE PANEL
            - Header proyek aktif & AI Model Badge
            - Riwayat percakapan & commit feed
            - Prompt input bar di bawah
            ===================================================================== */}
        <div
          style={{
            width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : `${splitRatio}%`,
          }}
          className={`h-full flex flex-col bg-[#090D16] border-r border-slate-800/80 overflow-hidden relative shrink-0 ${
            mobileActiveTab === 'chat' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {chatPanel ? (
            chatPanel
          ) : (
            <>
              {/* Chat Panel Header */}
              <div className="h-10 border-b border-slate-800/80 bg-slate-950/60 px-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-slate-200">ArtaStudio Chat Workspace</span>
                  <span className="text-[10px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded font-mono">
                    Arta AI 3.7
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <button
                    onClick={() => setChatFeed([])}
                    title="Bersihkan Percakapan"
                    className="p-1 hover:text-slate-200 rounded hover:bg-slate-800/60 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Chat Conversation History & Commit Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatFeed.map((item, idx) => {
                  if (item.type === 'message') {
                    const isUser = item.data.sender === 'user';
                    return (
                      <div
                        key={item.data.id || idx}
                        className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isUser && (
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5">
                            <Bot className="w-4 h-4" />
                          </div>
                        )}
                        <div
                          className={`max-w-[85%] rounded-xl p-3.5 text-xs shadow-md ${
                            isUser
                              ? 'bg-gradient-to-br from-amber-600/30 to-violet-600/30 border border-amber-500/30 text-slate-100 rounded-tr-none'
                              : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-none'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-1 text-[10px] text-slate-400">
                            <span className="font-semibold text-slate-300">
                              {isUser ? 'Anda' : item.data.model || 'ArtaStudio Assistant'}
                            </span>
                            <span>{item.data.timestamp}</span>
                          </div>
                          <div className="whitespace-pre-line leading-relaxed text-slate-200">{item.data.content}</div>

                          {item.data.suggestedAction && (
                            <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center gap-2">
                              <span className="text-[10px] text-amber-400 font-medium">Saran:</span>
                              <span className="text-[10px] text-slate-300">{item.data.suggestedAction}</span>
                            </div>
                          )}
                        </div>
                        {isUser && (
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 shrink-0 shadow-sm mt-0.5">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (item.type === 'commit') {
                    return (
                      <div key={item.data.id || idx} className="my-2">
                        <div className="p-3 rounded-xl bg-gradient-to-r from-violet-950/30 via-slate-900 to-amber-950/20 border border-violet-500/30 shadow-md">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
                              <GitCommit className="w-4 h-4 text-violet-400" />
                              <span>Commit Otomatis ArtaStudio</span>
                            </div>
                            <span className="font-mono text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              {item.data.shortHash}
                            </span>
                          </div>
                          <div className="text-xs text-slate-200 font-medium">{item.data.message}</div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800">
                            <div className="flex items-center gap-2 font-mono">
                              <span className="text-emerald-400">+{item.data.additions}</span>
                              <span className="text-rose-400">-{item.data.deletions}</span>
                              <span>• {item.data.filesChanged} berkas diubah</span>
                            </div>
                            <span>{item.data.timestamp}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}

                {isAiThinking && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 animate-pulse">
                    <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
                    <span>ArtaStudio AI sedang menulis kode & menyinkronkan komponen...</span>
                  </div>
                )}
              </div>

              {/* Chat Input Bar di Bawah */}
              <div className="p-3 bg-[#080C14] border-t border-slate-800/80 shrink-0">
                {/* Quick suggestions chips */}
                <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar pb-1 text-[11px]">
                  <button
                    onClick={() => setPromptInput('Perbaiki responsive mobile dan tambahkan navigasi tab')}
                    className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-400 hover:text-amber-300 transition-colors whitespace-nowrap"
                  >
                    + Responsive mobile
                  </button>
                  <button
                    onClick={() => setPromptInput('Tambahkan integrasi Cloudflare Edge Cache & Worker KV')}
                    className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 hover:border-violet-500/40 text-slate-400 hover:text-violet-300 transition-colors whitespace-nowrap"
                  >
                    + Cloudflare Edge Cache
                  </button>
                  <button
                    onClick={() => setPromptInput('Tambahkan tema warna amber dan violet di tombol utama')}
                    className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-400 hover:text-amber-300 transition-colors whitespace-nowrap"
                  >
                    + Aksen amber & violet
                  </button>
                </div>

                {/* Input Prompt Box */}
                <form
                  onSubmit={handleSendPromptSubmit}
                  className="rounded-xl bg-slate-900/90 border border-slate-700/80 focus-within:border-amber-500/60 focus-within:ring-1 focus-within:ring-amber-500/30 transition-all p-2 flex flex-col gap-2"
                >
                  <textarea
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendPromptSubmit();
                      }
                    }}
                    placeholder="Minta ArtaStudio AI membuat komponen, fitur, atau tata letak baru..."
                    rows={2}
                    className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden resize-none leading-relaxed"
                  />
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                    <div className="flex items-center gap-1 text-slate-400">
                      <button
                        type="button"
                        title="Lampirkan Dokumen / Gambar"
                        className="p-1 hover:text-amber-400 rounded transition-colors"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Model: Arta AI 3.7 Sonnet"
                        className="text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-800/80 font-mono"
                      >
                        Arta AI 3.7
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={!promptInput.trim()}
                      className="px-3 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-violet-600 hover:from-amber-400 hover:to-violet-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_10px_rgba(245,158,11,0.25)] transition-all disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <span>Kirim</span>
                      <Send className="w-3 h-3" />
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>

        {/* =====================================================================
            RESIZABLE DIVIDER ANTARA PANEL TENGAH & PANEL KANAN
            - Responsive drag divider
            - Interactive dragging state
            - Double-click to reset 50/50
            ===================================================================== */}
        <div
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onDoubleClick={() => setSplitRatio(50)}
          title="Geser untuk mengubah ukuran panel (Klik ganda untuk reset 50:50)"
          className={`hidden md:flex w-1.5 hover:w-2 bg-slate-900 hover:bg-gradient-to-b hover:from-amber-500 hover:via-violet-500 hover:to-amber-500 cursor-col-resize transition-all duration-150 relative items-center justify-center shrink-0 z-10 ${
            isDraggingDivider ? 'bg-gradient-to-b from-amber-500 via-violet-500 to-amber-500 w-2' : ''
          }`}
        >
          <div className="w-0.5 h-8 bg-slate-600 rounded-full opacity-60" />
        </div>

        {/* =====================================================================
            KOLOM KANAN: LIVE PREVIEW VIEWPORT
            - Header toolbar responsive (Device switcher, URL bar, Zoom, Tools)
            - Live preview iframe with sandbox container
            - Footer status bar (Route, Resolution, Connection latency)
            ===================================================================== */}
        <div
          style={{
            width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : `${100 - splitRatio}%`,
          }}
          className={`h-full flex flex-col bg-[#080B12] overflow-hidden shrink-0 ${
            mobileActiveTab === 'preview' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {previewPanel ? (
            previewPanel
          ) : (
            <>
              {/* Live Preview Header Toolbar */}
              <div className="h-10 bg-[#0B0F17] border-b border-slate-800/80 px-3 flex items-center justify-between shrink-0 gap-2">
                {/* Device Switcher (Desktop, Tablet, Mobile) */}
                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                  <button
                    onClick={() => {
                      setDeviceMode('desktop');
                      setIsMobileLandscape(false);
                    }}
                    title="Tampilan Desktop (100% Lebar Penuh)"
                    className={`p-1.5 rounded transition-all ${
                      deviceMode === 'desktop'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setDeviceMode('tablet');
                      setIsMobileLandscape(false);
                    }}
                    title="Tampilan Tablet (768px)"
                    className={`p-1.5 rounded transition-all ${
                      deviceMode === 'tablet'
                        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Tablet className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setDeviceMode('mobile');
                      setIsMobileLandscape(false);
                    }}
                    title="Tampilan Ponsel Mobile (375px)"
                    className={`p-1.5 rounded transition-all ${
                      deviceMode === 'mobile'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Address Bar with SSL Padlock & Refresh Button */}
                <div className="flex-1 max-w-md flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-mono text-[11px] text-slate-300 truncate select-all">{previewUrl}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={triggerRefreshPreview}
                      title="Segarkan Live Preview"
                      className="p-0.5 text-slate-400 hover:text-amber-400 transition-colors"
                    >
                      <RotateCw className={`w-3 h-3 ${isIframeRefreshing ? 'animate-spin text-amber-400' : ''}`} />
                    </button>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Buka di Tab Baru"
                      className="p-0.5 text-slate-400 hover:text-violet-400 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Zoom & Viewport Controls */}
                <div className="flex items-center gap-1.5 text-xs">
                  <select
                    value={previewZoom}
                    onChange={(e) => setPreviewZoom(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-800 text-[11px] text-slate-300 rounded px-1.5 py-0.5 focus:outline-hidden focus:border-amber-500/50"
                  >
                    <option value={100}>100%</option>
                    <option value={75}>75%</option>
                    <option value={50}>50%</option>
                  </select>
                </div>
              </div>

              {/* Viewport Canvas Container (Handles device bezels and zoom) */}
              <div className="flex-1 overflow-auto bg-[#07090F] flex items-center justify-center p-4 relative">
                {/* Mobile / Tablet Bezel Simulation */}
                <div
                  style={{
                    width:
                      deviceMode === 'desktop'
                        ? '100%'
                        : deviceMode === 'tablet'
                        ? isMobileLandscape
                          ? '1024px'
                          : '768px'
                        : isMobileLandscape
                        ? '667px'
                        : '375px',
                    height: deviceMode === 'desktop' ? '100%' : '100%',
                    maxHeight: deviceMode === 'desktop' ? '100%' : '840px',
                    transform: `scale(${previewZoom / 100})`,
                    transformOrigin: 'center top',
                  }}
                  className={`transition-all duration-300 relative flex flex-col ${
                    deviceMode !== 'desktop'
                      ? 'border-4 border-slate-800 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.8)] bg-slate-950 overflow-hidden'
                      : 'w-full h-full'
                  }`}
                >
                  {/* Mock Device Bezel Speaker / Camera Notch */}
                  {deviceMode !== 'desktop' && (
                    <div className="h-4 bg-slate-900 flex items-center justify-center shrink-0">
                      <div className="w-12 h-1 bg-slate-700 rounded-full" />
                    </div>
                  )}

                  {/* Web Iframe */}
                  <div className="flex-1 w-full h-full relative bg-[#090D16]">
                    {isIframeRefreshing && (
                      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-10 transition-opacity">
                        <div className="flex items-center gap-2 text-xs text-amber-400 font-mono">
                          <RotateCw className="w-4 h-4 animate-spin" />
                          <span>Menyinkronkan Live Preview...</span>
                        </div>
                      </div>
                    )}

                    <iframe
                      key={iframeKey}
                      src={previewUrl}
                      title="ArtaStudio Live Preview Viewport"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                      className="w-full h-full border-0 bg-white"
                      onError={() => {
                        // Handled automatically
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Live Preview Viewport Footer Status Bar */}
              <div className="h-7 bg-[#0B0F17] border-t border-slate-800/80 px-3 flex items-center justify-between text-[10px] text-slate-400 font-mono shrink-0">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-slate-300">
                    <span className="text-amber-400 font-semibold">Rute:</span> /
                  </span>
                  <span className="text-slate-500">•</span>
                  <span>
                    Resolusi:{' '}
                    {deviceMode === 'desktop'
                      ? '1440 × 900 px'
                      : deviceMode === 'tablet'
                      ? '768 × 1024 px'
                      : '375 × 812 px'}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <Wifi className="w-3 h-3" />
                    <span>HMR Online (18ms)</span>
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="text-violet-400 flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    <span>Cloudflare Edge Ready</span>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* =========================================================================
          ONE-CLICK PUBLISH TO EDGE MODAL DIALOG
          - Visual step pipeline
          - Cloudflare Edge Global Network deploy feedback
          - Live public URL generator
          ========================================================================= */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0F172A] border border-slate-700/80 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-violet-600 flex items-center justify-center shadow-[0_0_12px_rgba(245,158,11,0.4)]">
                  <CloudUpload className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Publikasikan ke Edge</h3>
                  <p className="text-[11px] text-slate-400">Cloudflare Edge Deployment Suite</p>
                </div>
              </div>
              <button
                onClick={() => setShowPublishModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Steps */}
            <div className="p-5 space-y-4 text-xs">
              {publishStep < 4 ? (
                <div className="space-y-3">
                  <div className="text-slate-300 font-medium">Sedang menjalankan pipeline deployment edge:</div>

                  {/* Step 1 */}
                  <div
                    className={`p-2.5 rounded-lg border flex items-center gap-3 ${
                      publishStep >= 1
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    {publishStep === 1 ? (
                      <RotateCw className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                    ) : publishStep > 1 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
                    )}
                    <div>
                      <div className="font-semibold">Membangun Aset Statis & Vite Client</div>
                      <div className="text-[10px] text-slate-400">Kompilasi TypeScript dan optimasi bundle</div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div
                    className={`p-2.5 rounded-lg border flex items-center gap-3 ${
                      publishStep >= 2
                        ? 'bg-violet-500/10 border-violet-500/30 text-violet-200'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    {publishStep === 2 ? (
                      <RotateCw className="w-4 h-4 animate-spin text-violet-400 shrink-0" />
                    ) : publishStep > 2 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
                    )}
                    <div>
                      <div className="font-semibold">Paket Worker & Edge Middleware</div>
                      <div className="text-[10px] text-slate-400">Konfigurasi Cloudflare Workers & R2 storage routing</div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div
                    className={`p-2.5 rounded-lg border flex items-center gap-3 ${
                      publishStep >= 3
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    {publishStep === 3 ? (
                      <RotateCw className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
                    )}
                    <div>
                      <div className="font-semibold">Menyinkronkan ke 280+ Global Edge Data Center</div>
                      <div className="text-[10px] text-slate-400">Distribusi global dengan waktu respons ultra-rendah</div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Step 4: Selesai! */
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/40 text-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div className="font-bold text-white text-sm">Berhasil Dipublikasikan ke Edge!</div>
                    <p className="text-[11px] text-slate-300">
                      Aplikasi Anda sekarang aktif di jaringan global Cloudflare dengan latensi super cepat.
                    </p>
                  </div>

                  {/* Link Result Box */}
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="text-[10px] uppercase font-bold text-slate-400">URL Edge Publik:</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={publishedEdgeUrl}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-amber-300 focus:outline-hidden"
                      />
                      <button
                        onClick={() => copyToClipboard(publishedEdgeUrl)}
                        className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? 'Disalin' : 'Salin'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/40 flex justify-end gap-2">
              <button
                onClick={() => setShowPublishModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
              >
                Tutup
              </button>
              {publishStep === 4 && (
                <a
                  href={publishedEdgeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-violet-600 hover:from-amber-400 hover:to-violet-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
                >
                  <span>Buka Website Edge</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SHARE MODAL DIALOG ("Bagikan")
          ========================================================================= */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#0F172A] border border-slate-700/80 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Bagikan Proyek</h3>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-300">
                Bagikan tautan pratinjau live ini kepada kolaborator atau pengguna untuk melihat hasil langsung.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={previewUrl}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-slate-300 focus:outline-hidden"
                />
                <button
                  onClick={() => copyToClipboard(previewUrl)}
                  className="px-2.5 py-1.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 text-xs font-medium flex items-center gap-1 transition-colors"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Disalin' : 'Salin'}</span>
                </button>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/40 flex justify-end">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioLayout;
