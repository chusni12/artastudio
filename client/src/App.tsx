import { localDB } from './services/localDbService';
import { AddProjectModal } from './components/AddProjectModal';
import { StudioProjectHubModal, HubTabId } from './components/StudioProjectHubModal';
import { AIProviderSettingsModal } from './components/AIProviderSettingsModal';
import { SecurityCheckModal } from './components/SecurityCheckModal';
import { CommitDiffModal } from './components/chat/CommitDiffModal';
import { CommitCard } from './components/chat/CommitCard';
import { ActionLogInspector } from './components/chat/ActionLogInspector';
import type { CommitItem } from './components/chat/types';
import type { SecurityAuditReport } from '../../shared/types';
import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  LayoutGrid,
  MessageSquare,
  Mic,
  MoreVertical,
  Pin,
  Play,
  Plus,
  RotateCw,
  Search,
  Filter,
  Send,
  Settings,
  Sparkles,
  X,
  ExternalLink,
  GitCommit,
  GitBranch,
  FileCode,
  Monitor,
  Tablet,
  Smartphone,
} from 'lucide-react';
import type {
  RepoProject,
  RepoBranch,
  CommitInfo,
  DetectedError,
  ChatMessage,
  ProcessStatus,
  WebSocketEvent,
  AIActionLog,
} from '../../shared/types';

export default function App() {
  // State: Server connection & Workspaces
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [mobileView, setMobileView] = useState<'preview' | 'chat' | 'projects'>('preview');
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [workspaces, setWorkspaces] = useState<RepoProject[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<RepoProject | null>(null);
  const [selectedBranchPath, setSelectedBranchPath] = useState<string>('');

  // Mobile specific UI states
  const [searchProjectQuery, setSearchProjectQuery] = useState<string>('');
  const [showRunningOnly, setShowRunningOnly] = useState<boolean>(false);
  const [isMobileRouteOpen, setIsMobileRouteOpen] = useState<boolean>(false);
  const [selectedCommitDiff, setSelectedCommitDiff] = useState<CommitItem | null>(null);
  const [isCommitDiffOpen, setIsCommitDiffOpen] = useState<boolean>(false);

  const quickChips = [
    '✨ Desain ulang header',
    '⚡ Optimasi performa',
    '🎨 Ganti tema gelap',
    '🧪 Jalankan unit test',
    '📱 Sempurnakan tampilan mobile',
  ];

  // Derived: Current active branch and active workspace
  const activeBranch =
    selectedRepo?.branches.find((b) => b.path === selectedBranchPath) ||
    selectedRepo?.branches.find((b) => b.isCurrent) ||
    selectedRepo?.branches.find((b) => b.name === 'main') ||
    selectedRepo?.branches.find((b) => b.name === 'master') ||
    selectedRepo?.branches.find((b) => b.name === 'bowhead') ||
    selectedRepo?.branches[0];

  const activePath = activeBranch?.path || selectedRepo?.defaultPath || '';

  const selectedWorkspace = selectedRepo
    ? {
        id: selectedRepo.id,
        name: selectedRepo.name,
        repoUrl: selectedRepo.repoUrl,
        path: activePath,
        framework: selectedRepo.framework,
        branch: activeBranch?.name || '',
        activeBranch,
      }
    : null;

  // State: Git & Process
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [devStatus, setDevStatus] = useState<ProcessStatus | null>(null);
  const [isStartingDev, setIsStartingDev] = useState<boolean>(false);

  // State: Chat & Sensor
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const latestAssistantMsgId = messages.filter((m) => m.sender === 'assistant').slice(-1)[0]?.id;
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isSendingPrompt, setIsSendingPrompt] = useState<boolean>(false);
  const [activeErrors, setActiveErrors] = useState<DetectedError[]>([]);
  const [isAutoFixing, setIsAutoFixing] = useState<boolean>(false);

  // State: Preview Viewport
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewUrl, setPreviewUrl] = useState<string>('http://localhost:5173');
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [isProjectHubOpen, setIsProjectHubOpen] = useState<boolean>(false);
  const [projectHubInitialTab, setProjectHubInitialTab] = useState<HubTabId>('domains');
  const [isAddProjectOpen, setIsAddProjectOpen] = useState<boolean>(false);
  const [selectedRoutePath, setSelectedRoutePath] = useState<string>('/');
  const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState<boolean>(false);
  const projectRoutesMap: Record<string, { label: string; path: string }[]> = {
    artaloka: [
      { label: 'Halaman Utama', path: '/' },
      { label: 'Katalog Marketplace', path: '/marketplace' },
      { label: 'Komisi Custom', path: '/commissions' },
      { label: 'Ruang Seniman', path: '/ruang-seniman' },
      { label: 'Pameran Seni (Galeri)', path: '/pameran-galeri' },
      { label: 'Toko Arta & Reward', path: '/toko' },
      { label: 'Profil Saya', path: '/profile' },
      { label: 'Item Saya', path: '/item-saya' },
      { label: 'Studio Paint (Draw)', path: '/studiopaint' },
      { label: 'Bantuan & FAQ', path: '/pusat-bantuan' },
      { label: 'Admin Dashboard', path: '/admin' },
    ],
    tahqiq: [
      { label: 'Beranda Tahqiq', path: '/' },
      { label: 'Katalog Kitab & Naskah', path: '/katalog' },
      { label: 'Editor Tahqiq', path: '/editor' },
      { label: 'Bantuan & Panduan', path: '/bantuan' },
    ],
    artastudio: [
      { label: 'Studio Dashboard', path: '/' },
      { label: 'Status & Logs API', path: '/api/health' },
      { label: 'Daftar Workspace', path: '/api/workspaces' },
    ],
  };

  const getActiveProjectRoutes = () => {
    const id = (selectedRepo?.name || selectedRepo?.id || '').toLowerCase();
    if (id.includes('artaloka')) return projectRoutesMap.artaloka;
    if (id.includes('tahqiq')) return projectRoutesMap.tahqiq;
    if (id.includes('studio')) return projectRoutesMap.artastudio;
    return [
      { label: 'Halaman Utama', path: '/' },
      { label: 'Tentang Kami', path: '/about' },
      { label: 'Kontak', path: '/contact' },
    ];
  };

  const currentProjectRoutes = getActiveProjectRoutes();
  const [isAISettingsOpen, setIsAISettingsOpen] = useState<boolean>(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);
  const [securityReport, setSecurityReport] = useState<SecurityAuditReport | null>(null);
  const [isLoadingSecurity, setIsLoadingSecurity] = useState<boolean>(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(true);
  const [isSidebarHovered, setIsSidebarHovered] = useState<boolean>(false);
  const [deployNotification, setDeployNotification] = useState<string | null>(null);
  const [gitToast, setGitToast] = useState<{
    id: string;
    message: string;
    shortHash: string;
    author?: string;
    commit?: CommitItem;
  } | null>(null);

  // Auto-dismiss git toast after 7s
  useEffect(() => {
    if (gitToast) {
      const timer = setTimeout(() => {
        setGitToast(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [gitToast]);

  // Sync active project path to backend Git Watcher
  useEffect(() => {
    if (activePath) {
      fetch('/api/git/active-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: activePath }),
      }).catch(() => {});
    }
  }, [activePath]);

  // Layout & Resizing States (Desktop)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(true);
  const [chatWidthPercent, setChatWidthPercent] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Initial Data Fetch
  useEffect(() => {
    fetchWorkspaces();
    fetchChatHistory();
    fetchErrors();
    fetchDevStatus();
  }, []);

  // Setup WebSocket Client
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.hostname}:4000`;

    let socket: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      try {
        socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          setWsConnected(true);
          setLogs((prev) => [...prev, `[WebSocket] Terhubung ke ArtaStudio Core Server di ${wsUrl}`]);
        };

        socket.onclose = () => {
          setWsConnected(false);
          setLogs((prev) => [...prev, `[WebSocket] Terputus. Mencoba menghubungkan kembali...`]);
          reconnectTimeout = setTimeout(connect, 3000);
        };

        socket.onerror = () => {
          setWsConnected(false);
        };

        socket.onmessage = (event) => {
          try {
            const data: WebSocketEvent = JSON.parse(event.data);
            handleWebSocketMessage(data);
          } catch {
            // Ignore non-json
          }
        };
      } catch (err) {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (socket) socket.close();
    };
  }, []);

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = (payload: WebSocketEvent) => {
    const channel = payload.channel as string;
    if (channel === 'logs') {
      if (payload.event === 'process:stdout' || payload.event === 'process:stderr') {
        const text = (payload.data as any)?.text || '';
        setLogs((prev) => [...prev.slice(-300), text.trim()]);
      } else if (payload.event === 'log:new' && payload.data) {
        const msg = (payload.data as any).message;
        if (msg) setLogs((prev) => [...prev.slice(-300), msg]);
      }
    } else if (channel === 'errors') {
      if (payload.event === 'error:detected') {
        setActiveErrors((prev) => [payload.data as DetectedError, ...prev]);
      }
    } else if (channel === 'chat') {
      if (payload.event === 'message:new' || payload.event === 'message:update') {
        const msg = payload.data as ChatMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) {
            return prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m));
          }
          return [...prev, msg];
        });
      } else if (payload.event === 'message:chunk' || payload.event === 'text_delta') {
        const chunkData = payload.data as any;
        const targetId = chunkData.id || chunkData.message?.id;
        const newText = chunkData.accumulated ?? chunkData.text ?? chunkData.message?.text;
        const newStatus = chunkData.status || chunkData.message?.status;
        const newActionLogs = chunkData.actionLogs || chunkData.message?.actionLogs;
        if (targetId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId
                ? {
                    ...m,
                    text: newText !== undefined ? newText : (m.text + (chunkData.delta || '')),
                    status: newStatus || m.status,
                    actionLogs: newActionLogs || m.actionLogs,
                  }
                : m
            )
          );
        }
      } else if (payload.event === 'message:status' || payload.event === 'status') {
        const statusData = payload.data as any;
        const targetId = statusData.id || statusData.message?.id;
        const newStatus = statusData.status;
        const statusMsg = statusData.statusMessage || statusData.message;
        const newActionLogs = statusData.actionLogs || statusData.message?.actionLogs;
        if (targetId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId
                ? {
                    ...m,
                    status: newStatus,
                    statusMessage: typeof statusMsg === 'string' ? statusMsg : (m as any).statusMessage,
                    text: statusData.text !== undefined ? statusData.text : m.text,
                    actionLogs: newActionLogs || m.actionLogs,
                  }
                : m
            )
          );
        }
      } else if (payload.event === 'message:action_log' || payload.event === 'action_log') {
        const logData = payload.data as any;
        const targetId = logData.id || logData.messageId || logData.message?.id;
        const newLog = logData.actionLog as AIActionLog | undefined;
        const allLogs = logData.actionLogs as AIActionLog[] | undefined;
        if (targetId) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== targetId) return m;
              let updatedLogs = allLogs ? [...allLogs] : [...(m.actionLogs || [])];
              if (!allLogs && newLog) {
                const idx = updatedLogs.findIndex((l) => l.id === newLog.id);
                if (idx >= 0) {
                  updatedLogs[idx] = newLog;
                } else {
                  updatedLogs.push(newLog);
                }
              }
              return {
                ...m,
                actionLogs: updatedLogs,
              };
            })
          );
        }
      }
    } else if (channel === 'process') {
      if (payload.event === 'status_change') {
        const procData = payload.data as any;
        if (procData && procData.projectPath === (selectedBranchPath || selectedRepo?.defaultPath)) {
          setDevStatus(procData);
          if (procData.url) {
            setPreviewUrl(procData.url);
          }
        }
      }
    } else if (channel === 'system') {
      if (payload.event === 'deploy:started') {
        setIsDeploying(true);
        setDeployNotification('Edge deployment sedang berlangsung...');
      } else if (payload.event === 'deploy:finished') {
        setIsDeploying(false);
        setDeployNotification(`Edge deployment sukses: ${(payload.data as any)?.url || ''}`);
        setTimeout(() => setDeployNotification(null), 6000);
      }
    } else if (channel === 'workspaces') {
      if (payload.event === 'clone:progress') {
        const data = payload.data as any;
        if (data?.text) {
          setLogs((prev) => [...prev.slice(-300), `[Git Clone] ${data.text}`]);
        }
        window.dispatchEvent(new CustomEvent('artastudio:clone:progress', { detail: data }));
      }
    } else if (channel === 'git') {
      if (payload.event === 'commit:new') {
        const { commit, projectPath } = (payload.data as any) || {};
        if (commit) {
          const commitItem: CommitItem = {
            id: commit.hash || commit.id,
            hash: commit.hash,
            shortHash: commit.shortHash || commit.hash?.slice(0, 7) || '',
            message: commit.message || 'Update commit baru',
            author: commit.author || 'Developer',
            timestamp:
              typeof commit.timestamp === 'string' && commit.timestamp.includes(':')
                ? commit.timestamp
                : new Date(commit.date || Date.now()).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
            branch: commit.branch || activeBranch?.name || 'main',
            filesChanged: commit.filesChanged ?? 1,
            additions: commit.additions ?? 0,
            deletions: commit.deletions ?? 0,
            isGitHubSync: true,
            source: 'github',
          };

          const commitMsg: ChatMessage = {
            id: `commit_${commit.hash || commit.shortHash || Date.now()}`,
            sender: 'system',
            text: commit.message || 'Update commit baru',
            timestamp: commit.date || commit.timestamp || new Date().toISOString(),
            type: 'commit' as any,
            commitHash: commit.hash,
            commit: commitItem,
          };

          // Masukkan kartu commit ke feed messages chat aktif
          setMessages((prev) => {
            if (prev.some((m) => m.commitHash === commit.hash || m.id === commitMsg.id)) {
              return prev;
            }
            return [...prev, commitMsg];
          });

          // Perbarui list commits lokal agar sinkron
          setCommits((prev) => {
            if (prev.some((c) => c.hash === commit.hash)) return prev;
            return [
              {
                hash: commit.hash,
                shortHash: commit.shortHash || commit.hash.slice(0, 7),
                message: commit.message,
                author: commit.author || 'Developer',
                date: commit.date || new Date().toISOString(),
                type: commit.type || 'other',
              },
              ...prev,
            ];
          });

          // Tampilkan toast notifikasi di pojok kiri bawah
          setGitToast({
            id: commit.hash || String(Date.now()),
            message: commit.message || 'Update commit baru',
            shortHash: commit.shortHash || commit.hash?.slice(0, 7) || '',
            author: commit.author || 'Developer',
            commit: commitItem,
          });
        }
      }
    }
  };

  // Auto-sync chat messages to IndexedDB
  useEffect(() => {
    if (messages.length > 0 && selectedRepo) {
      const sessId = `ws_${selectedRepo.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      localDB.saveChatSession(sessId, selectedRepo.id, messages).catch(() => {});
    }
  }, [messages, selectedRepo]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Fetch API handlers
  const fetchWorkspaces = async () => {
    try {
      const res = await fetch('/api/workspaces');
      const data = await res.json();
      if (data.success && (data.workspaces || data.repos)) {
        const repoList: RepoProject[] = data.workspaces || data.repos;
                setWorkspaces(repoList);
        // Persist to IndexedDB
        repoList.forEach((r) => {
          localDB.saveWorkspace({
            id: r.id,
            name: r.name,
            repoUrl: r.repoUrl,
            defaultPath: r.defaultPath,
            framework: r.framework,
            pinned: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }).catch(() => {});
        });
        if (repoList.length > 0 && !selectedRepo) {
          const currentRepo =
            repoList.find((r) => r.branches.some((b) => b.isCurrent)) || repoList[0];
          const currentBranch =
            currentRepo.branches.find((b) => b.isCurrent) ||
            currentRepo.branches.find((b) => b.name === 'main') ||
            currentRepo.branches.find((b) => b.name === 'master') ||
            currentRepo.branches.find((b) => b.name === 'bowhead') ||
            currentRepo.branches[0];
          setSelectedRepo(currentRepo);
          const initialPath = currentBranch?.path || currentRepo.defaultPath;
          setSelectedBranchPath(initialPath);
          fetchCommits(initialPath);
          updatePreviewUrl(currentRepo, initialPath);
        }
      }
    } catch (err) {
      console.error('Gagal mengambil daftar workspaces:', err);
    }
  };

  const updatePreviewUrl = (repo: RepoProject, targetPath: string) => {
    if (devStatus && devStatus.projectPath === targetPath && devStatus.url && devStatus.status === 'running') {
      setPreviewUrl(devStatus.url);
      return;
    }

    const id = (repo.name || repo.id || '').toLowerCase();
    if (id.includes('artaloka') || targetPath.includes('bowhead')) {
      setPreviewUrl('http://localhost:5199');
    } else if (id.includes('tahqiq')) {
      setPreviewUrl('http://localhost:3000');
    } else if (id.includes('studio')) {
      setPreviewUrl('http://localhost:5173');
    } else {
      setPreviewUrl('http://localhost:5173');
    }
  };

  const fetchCommits = async (projectPath: string) => {
    try {
      const res = await fetch(`/api/git/history?path=${encodeURIComponent(projectPath)}&limit=10`);
      const data = await res.json();
      if (data.success && data.commits) {
        setCommits(data.commits);
      }
    } catch (err) {
      console.error('Gagal mengambil git history:', err);
    }
  };

  const fetchChatHistory = async (targetSessionId?: string) => {
    try {
      const sessId = targetSessionId || (selectedRepo ? `ws_${selectedRepo.id.replace(/[^a-zA-Z0-9_-]/g, '_')}` : 'default');
      const res = await fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessId)}`);
      const data = await res.json();
      if (data.success && data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Gagal mengambil riwayat chat:', err);
    }
  };

  const fetchErrors = async () => {
    try {
      const res = await fetch('/api/sensor/errors');
      const data = await res.json();
      if (data.success && data.errors) {
        setActiveErrors(data.errors);
      }
    } catch (err) {
      console.error('Gagal mengambil error sensor:', err);
    }
  };

  const fetchDevStatus = async () => {
    try {
      const path = selectedWorkspace?.path || '';
      const res = await fetch(`/api/process/status?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.success && data.status) {
        setDevStatus(data.status);
      }
    } catch (err) {
      console.error('Gagal mengambil status proses:', err);
    }
  };

  // Drag resizer logic (Desktop)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const leftOffset = isSidebarOpen ? 256 : 40;
      const totalWidth = window.innerWidth - leftOffset;
      const relX = e.clientX - leftOffset;
      const pct = Math.min(Math.max((relX / totalWidth) * 100, 15), 85);
      setChatWidthPercent(pct);
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isSidebarOpen]);

  const handleSelectWorkspace = async (repo: RepoProject, branchPath?: string) => {
    setSelectedRepo(repo);
    const targetBranch = branchPath
      ? repo.branches.find((b) => b.path === branchPath)
      : repo.branches.find((b) => b.isCurrent) ||
        repo.branches.find((b) => b.name === 'main') ||
        repo.branches.find((b) => b.name === 'master') ||
        repo.branches.find((b) => b.name === 'bowhead') ||
        repo.branches[0];
    const targetPath = targetBranch?.path || repo.defaultPath;
    setSelectedBranchPath(targetPath);
    fetchCommits(targetPath);
    setSelectedRoutePath('/');

    // 1. Isolasi Chat
    const projectSessionId = `ws_${repo.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    fetchChatHistory(projectSessionId);

    // 2. Isolasi Dev Server & Preview
    try {
      const statusRes = await fetch(`/api/process/status?projectPath=${encodeURIComponent(targetPath)}`);
      const statusData = await statusRes.json();
      if (statusData.status && statusData.status.status === 'running') {
        setDevStatus(statusData.status);
        if (statusData.status.url) {
          setPreviewUrl(statusData.status.url);
          return;
        }
      } else {
        const idLower = (repo.name || repo.id || '').toLowerCase();
        const autoPort = idLower.includes('artaloka') ? 5199 : idLower.includes('tahqiq') ? 3000 : 5173;

        fetch('/api/process/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath: targetPath, port: autoPort }),
        }).then(r => r.json()).then(startData => {
          if (startData.status || startData.instance) {
            const inst = startData.status || startData.instance;
            setDevStatus(inst);
            if (inst.url) setPreviewUrl(inst.url);
          }
        }).catch(() => {});
      }
    } catch(e) {}

    updatePreviewUrl(repo, targetPath);
  };

  const handleSelectBranch = (repo: RepoProject, branchPath: string) => {
    setSelectedBranchPath(branchPath);
    fetchCommits(branchPath);
    updatePreviewUrl(repo, branchPath);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputPrompt.trim() || isSendingPrompt) return;

    const text = inputPrompt.trim();
    setInputPrompt('');
    setIsSendingPrompt(true);

    const sessionId = selectedRepo ? `ws_${selectedRepo.id.replace(/[^a-zA-Z0-9_-]/g, '_')}` : 'default';

    // Jika WebSocket sedang tidak aktif, gunakan SSE stream sebagai fallback real-time
    if (!wsConnected && typeof EventSource !== 'undefined') {
      try {
        const es = new EventSource(`/api/chat/stream/${encodeURIComponent(sessionId)}`);
        es.onmessage = (evt) => {
          try {
            const sseData = JSON.parse(evt.data);
            if (sseData.type === 'message:new' || sseData.type === 'done') {
              const msg = sseData.message;
              if (msg) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === msg.id)) {
                    return prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m));
                  }
                  return [...prev, msg];
                });
              }
              if (sseData.type === 'done') es.close();
            } else if (sseData.type === 'text_delta') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === sseData.message?.id
                    ? {
                        ...m,
                        text: sseData.accumulated ?? (m.text + (sseData.delta || '')),
                        status: sseData.message?.status,
                      }
                    : m
                )
              );
            } else if (sseData.type === 'status') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === (sseData.assistantMsg?.id || sseData.message?.id)
                    ? {
                        ...m,
                        status: sseData.status,
                        statusMessage: typeof sseData.message === 'string' ? sseData.message : undefined,
                        actionLogs: sseData.actionLogs || sseData.assistantMsg?.actionLogs || m.actionLogs,
                      }
                    : m
                )
              );
            } else if (sseData.type === 'action_log') {
              const targetId = sseData.messageId || sseData.id || sseData.message?.id;
              if (targetId) {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== targetId) return m;
                    let updatedLogs = sseData.actionLogs ? [...sseData.actionLogs] : [...(m.actionLogs || [])];
                    if (!sseData.actionLogs && sseData.actionLog) {
                      const idx = updatedLogs.findIndex((l: AIActionLog) => l.id === sseData.actionLog.id);
                      if (idx >= 0) {
                        updatedLogs[idx] = sseData.actionLog;
                      } else {
                        updatedLogs.push(sseData.actionLog);
                      }
                    }
                    return {
                      ...m,
                      actionLogs: updatedLogs,
                    };
                  })
                );
              }
            }
          } catch {}
        };
        es.onerror = () => es.close();
      } catch {}
    }

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          text,
          projectPath: selectedBranchPath || selectedRepo?.defaultPath || process.cwd(),
          engineMode: (() => {
            try {
              const cfg = localStorage.getItem('artastudio_ai_config');
              if (cfg) return JSON.parse(cfg).mode || 'opencode';
            } catch(e) {}
            return 'opencode';
          })(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.userMessage && data.assistantMessage) {
          setMessages((prev) => {
            const hasUser = prev.some((m) => m.id === data.userMessage.id);
            const hasAssistant = prev.some((m) => m.id === data.assistantMessage.id);
            let next = [...prev];
            if (!hasUser) next.push(data.userMessage);
            if (!hasAssistant) {
              next.push(data.assistantMessage);
            } else {
              next = next.map((m) =>
                m.id === data.assistantMessage.id ? { ...data.assistantMessage, ...m } : m
              );
            }
            return next;
          });
        }
      }
    } catch (err) {
      console.error('Gagal mengirim pesan chat:', err);
    } finally {
      setIsSendingPrompt(false);
    }
  };

  const handleTriggerAutoFix = async (errorId: string) => {
    setIsAutoFixing(true);
    try {
      const res = await fetch('/api/sensor/auto-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorId }),
      });
      const data = await res.json();
      if (data.success && data.prompt) {
        setInputPrompt(data.prompt);
      }
    } catch (err) {
      console.error('Gagal memicu auto-fix:', err);
    } finally {
      setIsAutoFixing(false);
    }
  };

  const handleOpenSecurityAudit = async () => {
    const targetPath = selectedBranchPath || selectedRepo?.defaultPath || process.cwd();
    setIsSecurityModalOpen(true);
    setIsLoadingSecurity(true);
    try {
      const res = await fetch(`/api/security/audit?projectPath=${encodeURIComponent(targetPath)}`);
      const data = await res.json();
      if (data.success && data.report) {
        setSecurityReport(data.report);
      }
    } catch (err) {
      console.error('Gagal menjalankan security audit:', err);
    } finally {
      setIsLoadingSecurity(false);
    }
  };

  const handleTriggerDeploy = async () => {
    if (!selectedWorkspace || isDeploying) return;
    setIsDeploying(true);
    try {
      const res = await fetch('/api/deploy/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: selectedWorkspace.path }),
      });
      const data = await res.json();
      if (data.success) {
        setDeployNotification('Edge deployment dimulai...');
      }
    } catch (err) {
      console.error('Gagal memicu deployment:', err);
      setIsDeploying(false);
    }
  };

  // Convert commits to CommitItem for timeline cards (Standar Lovable Image 2)
  const commitItems: CommitItem[] = commits.map((c) => ({
    id: c.hash,
    hash: c.hash,
    shortHash: c.shortHash || c.hash.slice(0, 7),
    message: c.message,
    author: c.author || 'Developer',
    timestamp: c.date || 'Baru saja',
    branch: activeBranch?.name || 'main',
    filesChanged: 2,
    additions: 12,
    deletions: 3,
    isGitHubSync: true,
    source: 'github' as const,
  }));

  // Filter workspaces for mobile projects list
  const filteredWorkspaces = workspaces.filter((repo) => {
    const q = searchProjectQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      repo.name.toLowerCase().includes(q) ||
      repo.framework.toLowerCase().includes(q) ||
      repo.repoUrl.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (showRunningOnly) {
      const isRunning =
        devStatus?.status === 'running' &&
        (devStatus.projectPath === repo.defaultPath || selectedRepo?.id === repo.id);
      return isRunning;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f17] text-slate-100 font-sans select-none overflow-hidden">
      {/* ========================================================
          MOBILE VIEW ARCHITECTURE (< 768px - Standar Lovable Mobile)
          ======================================================== */}
      {isMobileScreen ? (
        <div className="h-full w-full flex flex-col relative overflow-hidden bg-[#0b0f17]">
          {/* 1. MOBILE VIEW: PREVIEW (Layar Preview Penuh 1:1 Lovable) */}
          {mobileView === 'preview' && (
            <div className="h-full w-full flex flex-col relative overflow-hidden bg-[#0b0f17]">
              {/* Minimalist Top Header */}
              <header className="h-12 border-b border-slate-800/80 bg-[#0c121e]/95 backdrop-blur-md px-3 flex items-center justify-between shrink-0 z-20">
                {/* Left: Button to Switch to Projects List */}
                <button
                  onClick={() => setMobileView('projects')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-200 hover:border-slate-700 active:scale-95 transition-all shadow-sm"
                  title="Lihat Semua Proyek"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-bold text-xs truncate max-w-[120px]">
                    {selectedRepo?.name || 'Proyek'}
                  </span>
                </button>

                {/* Center: Route Switcher Pill */}
                <div className="relative">
                  <button
                    onClick={() => setIsMobileRouteOpen(!isMobileRouteOpen)}
                    className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 bg-slate-950/80 px-2.5 py-1 rounded-full border border-slate-800 active:scale-95 transition-all shadow-inner"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="truncate max-w-[110px]">
                      {currentProjectRoutes.find((r) => r.path === selectedRoutePath)?.label || selectedRoutePath}
                    </span>
                    <span className="text-[9px] text-slate-500">▾</span>
                  </button>
                </div>

                {/* Right: Refresh, External Tab & Studio Hub */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const iframe = document.getElementById('preview-iframe-mobile') as HTMLIFrameElement;
                      if (iframe) iframe.src = previewUrl;
                    }}
                    className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all"
                    title="Muat Ulang Iframe"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all"
                    title="Buka di Tab Baru"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => setIsProjectHubOpen(true)}
                    className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all"
                    title="Pengaturan Proyek & Cloud (Lainnya)"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
              </header>

              {/* Mobile Route Dropdown Drawer */}
              {isMobileRouteOpen && (
                <div className="absolute top-13 left-3 right-3 z-50 bg-[#0a0f19] border border-slate-800 rounded-xl shadow-2xl p-2 max-h-72 overflow-y-auto space-y-1 backdrop-blur-lg animate-in fade-in">
                  <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-400 border-b border-slate-800/80 mb-1">
                    <span>Pilih Halaman / Rute</span>
                    <button onClick={() => setIsMobileRouteOpen(false)} className="text-slate-500 hover:text-white">✕</button>
                  </div>
                  {currentProjectRoutes.map((r) => (
                    <button
                      key={r.path}
                      onClick={() => {
                        setSelectedRoutePath(r.path);
                        setIsMobileRouteOpen(false);
                        const base = previewUrl.split('/')[0] + '//' + previewUrl.split('/')[2];
                        const target = `${base}${r.path}`;
                        setPreviewUrl(target);
                        const iframe = document.getElementById('preview-iframe-mobile') as HTMLIFrameElement;
                        if (iframe) iframe.src = target;
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        selectedRoutePath === r.path
                          ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30'
                          : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      <span>{r.label}</span>
                      <code className="text-[10px] font-mono text-slate-500">{r.path}</code>
                    </button>
                  ))}
                </div>
              )}

              {/* Edge-to-Edge Full Screen Preview (100% Layar HP, Tanpa Bezel Ganda Oranye) */}
              <div className="flex-1 w-full h-full relative overflow-hidden bg-white">
                <iframe
                  id="preview-iframe-mobile"
                  src={previewUrl}
                  title="ArtaStudio Mobile Preview"
                  className="w-full h-full border-0 block"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
              </div>

              {/* Floating Bottom Bar (Standar Lovable Image 3) */}
              <div className="fixed bottom-4 left-3 right-3 z-40 flex items-center justify-between pointer-events-none">
                {/* Left: Chat Pill */}
                <button
                  onClick={() => setMobileView('chat')}
                  className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-900/95 hover:bg-slate-800 text-slate-100 border border-slate-700/80 shadow-2xl backdrop-blur-md text-xs font-semibold active:scale-95 transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-amber-400" />
                  <span>Chat</span>
                  {messages.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </button>

                {/* Center: Controls Pill (Mic, Reload, Route) */}
                <div className="pointer-events-auto flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-md">
                  <button
                    onClick={() => {
                      setInputPrompt('Tolong analisis dan perbaiki tampilan komponen ini');
                      setMobileView('chat');
                    }}
                    title="Perintah Suara / Cepat"
                    className="p-1 rounded-full text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                  >
                    <Mic className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-3 bg-slate-700" />
                  <button
                    onClick={() => {
                      const iframe = document.getElementById('preview-iframe-mobile') as HTMLIFrameElement;
                      if (iframe) iframe.src = previewUrl;
                    }}
                    title="Muat Ulang Halaman"
                    className="p-1 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-3 bg-slate-700" />
                  <button
                    onClick={() => setIsMobileRouteOpen(!isMobileRouteOpen)}
                    title="Pilih Rute"
                    className="p-1 rounded-full text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors text-xs"
                  >
                    <span className="text-[11px]">📄</span>
                  </button>
                </div>

                {/* Right: Publish Pill (Memicu Security Pre-Flight Modal) */}
                <button
                  onClick={handleOpenSecurityAudit}
                  disabled={isDeploying}
                  className="pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-500 hover:from-blue-500 hover:to-amber-400 text-white font-bold text-xs shadow-xl shadow-indigo-500/25 active:scale-95 transition-all disabled:opacity-50"
                >
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  <span>Publish</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. MOBILE VIEW: CHAT AI (Layar Chat Penuh 1:1 Lovable Image 2) */}
          {mobileView === 'chat' && (
            <div className="h-full w-full flex flex-col relative overflow-hidden bg-[#0b0f17]">
              {/* Header: Tombol ✕, Dropdown Proyek di tengah, Tombol > di kanan */}
              <header className="h-12 border-b border-slate-800/80 bg-[#0c121e]/95 backdrop-blur-md px-3 flex items-center justify-between shrink-0 z-20">
                <button
                  onClick={() => setMobileView('preview')}
                  className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all"
                  title="Tutup Chat & Kembali ke Preview"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedRepo?.id || ''}
                    onChange={(e) => {
                      const repo = workspaces.find((w) => w.id === e.target.value);
                      if (repo) handleSelectWorkspace(repo);
                    }}
                    className="bg-slate-900/90 text-xs font-bold text-slate-200 border border-slate-700/80 rounded-xl px-2.5 py-1 focus:outline-none focus:border-amber-500 max-w-[150px] truncate cursor-pointer"
                  >
                    {workspaces.map((repo) => (
                      <option key={repo.id} value={repo.id}>
                        {repo.name}
                      </option>
                    ))}
                  </select>
                  {activeBranch?.name && (
                    <button
                      type="button"
                      onClick={() => {
                        setProjectHubInitialTab('git');
                        setIsProjectHubOpen(true);
                      }}
                      title="Buka Pengaturan Git & GitHub"
                      className="text-[10px] font-mono text-amber-400 bg-slate-950 hover:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-800 hover:border-amber-500/40 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>🌿</span>
                      <span>{activeBranch.name}</span>
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setMobileView('preview')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25 active:scale-95 text-xs font-semibold transition-all"
                  title="Lihat Pratinjau Langsung"
                >
                  <span>Preview</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </header>

              {/* Active Sensor Errors */}
              {activeErrors.length > 0 && (
                <div className="p-2.5 bg-red-950/50 border-b border-red-800/60 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 text-xs text-red-300">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span>{activeErrors.length} Error Terdeteksi</span>
                  </div>
                  <button
                    onClick={() => handleTriggerAutoFix(activeErrors[0].id)}
                    disabled={isAutoFixing}
                    className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-semibold text-[11px] shadow disabled:opacity-50"
                  >
                    {isAutoFixing ? 'Memperbaiki...' : 'Perbaiki Otomatis'}
                  </button>
                </div>
              )}

              {/* Chat Feed */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.map((m) =>
                  m.type === 'commit' || (m as any).commit ? (
                    <div key={m.id} className="w-full my-1">
                      <CommitCard
                        commit={
                          (m as any).commit || {
                            id: m.id,
                            hash: m.commitHash || m.id,
                            shortHash: (m.commitHash || m.id).slice(0, 7),
                            message: m.text,
                            author: 'Developer',
                            timestamp: new Date(m.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                            branch: activeBranch?.name || 'main',
                            filesChanged: 1,
                            additions: 0,
                            deletions: 0,
                            isGitHubSync: true,
                            source: 'github',
                          }
                        }
                        onViewDetail={(commit) => {
                          setSelectedCommitDiff(commit);
                          setIsCommitDiffOpen(true);
                        }}
                        onPreview={() => {
                          setMobileView('preview');
                        }}
                        isCurrentPreview={false}
                      />
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {m.sender === 'user' ? 'Anda' : 'ArtaStudio AI'}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          {new Date(m.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div
                        className={`max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed ${
                          m.sender === 'user'
                            ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-xs shadow-md shadow-amber-500/10'
                            : 'bg-slate-900/90 text-slate-200 border border-slate-800 rounded-tl-xs shadow-md'
                        }`}
                      >
                        {m.text ? (
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        ) : m.sender === 'assistant' && m.status !== 'done' ? (
                          <p className="text-slate-400 italic text-[11px] animate-pulse">
                            Sedang memproses instruksi Anda...
                          </p>
                        ) : null}
                        {/* Collapsible Action Log & Tool Execution Inspector (Ala Orca / Lovable) */}
                        {m.sender === 'assistant' && (
                          <ActionLogInspector
                            actionLogs={m.actionLogs}
                            status={m.status}
                            statusMessage={(m as any).statusMessage}
                            isLatestAssistant={m.id === latestAssistantMsgId}
                          />
                        )}
                      </div>
                    </div>
                  )
                )}

                {/* Timeline Commit Cards (Standar Lovable Image 2) */}
                {commitItems.slice(0, 1).map((item) => (
                  <CommitCard
                    key={item.id}
                    commit={item}
                    onViewDetail={(commit) => {
                      setSelectedCommitDiff(commit);
                      setIsCommitDiffOpen(true);
                    }}
                    onPreview={() => {
                      setMobileView('preview');
                    }}
                    isCurrentPreview={false}
                  />
                ))}

                <div ref={chatScrollRef} />
              </div>

              {/* Quick Chips & Chat Input Form */}
              <div className="shrink-0 border-t border-slate-800 bg-[#0a0e17]/95">
                {/* Quick Chips / Saran Cepat */}
                <div className="flex items-center gap-1.5 overflow-x-auto py-2 px-3 no-scrollbar">
                  {quickChips.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setInputPrompt(chip)}
                      className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-amber-500/50 hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Input Form */}
                <form onSubmit={handleSendMessage} className="p-2.5 pt-0">
                  <div className="relative flex items-center bg-slate-900 border border-slate-700/80 rounded-2xl px-3 py-1 focus-within:border-amber-500 transition-colors shadow-inner">
                    <button
                      type="button"
                      onClick={() => {
                        setInputPrompt((prev) => (prev ? prev + ' ' : '') + 'Tolong optimalkan tampilan ini');
                      }}
                      className="p-1.5 text-slate-400 hover:text-amber-400 transition-colors"
                      title="Bantuan Suara / Cepat"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                    <textarea
                      value={inputPrompt}
                      onChange={(e) => setInputPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Tanyakan atau instruksikan perubahan kode..."
                      rows={1}
                      className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 px-2 py-2 focus:outline-none resize-none max-h-24 font-sans"
                    />
                    <button
                      type="submit"
                      disabled={!inputPrompt.trim() || isSendingPrompt}
                      className="p-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-30 disabled:hover:bg-amber-500 transition-all font-bold"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* 3. MOBILE VIEW: PROJECTS HUB (Layar Daftar Proyek 1:1 Lovable Image 4) */}
          {mobileView === 'projects' && (
            <div className="h-full w-full flex flex-col relative overflow-hidden bg-[#0b0f17]">
              {/* Top Section: Header & Search/Filter */}
              <div className="px-4 pt-4 pb-2 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-black tracking-tight text-white">Projects</h1>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      {workspaces.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsAddProjectOpen(true)}
                      className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all"
                      title="Tambah Proyek"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsProjectHubOpen(true)}
                      className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all"
                      title="Pengaturan Studio"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Search & Filter Bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative flex items-center">
                    <Search className="w-3.5 h-3.5 absolute left-3 text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      value={searchProjectQuery}
                      onChange={(e) => setSearchProjectQuery(e.target.value)}
                      placeholder="Cari proyek atau framework..."
                      className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-7 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors shadow-inner"
                    />
                    {searchProjectQuery && (
                      <button
                        onClick={() => setSearchProjectQuery('')}
                        className="absolute right-2.5 text-slate-500 hover:text-slate-300 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setShowRunningOnly(!showRunningOnly)}
                    className={`p-2 rounded-xl border transition-colors ${
                      showRunningOnly
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                        : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                    title="Filter server aktif"
                  >
                    <Filter className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Projects Card List */}
              <div className="flex-1 overflow-y-auto px-4 pb-32 space-y-2.5 pt-2">
                {filteredWorkspaces.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <p className="text-slate-400 text-xs">Tidak ada proyek yang sesuai pencarian.</p>
                    <button
                      onClick={() => {
                        setSearchProjectQuery('');
                        setShowRunningOnly(false);
                      }}
                      className="mt-2 text-xs text-amber-400 underline font-medium"
                    >
                      Reset filter
                    </button>
                  </div>
                ) : (
                  filteredWorkspaces.map((repo) => {
                    const isSelected = selectedRepo?.id === repo.id;
                    const isRunning =
                      devStatus?.status === 'running' &&
                      (devStatus.projectPath === repo.defaultPath || isSelected);

                    return (
                      <div
                        key={repo.id}
                        onClick={() => {
                          handleSelectWorkspace(repo);
                          setMobileView('preview');
                        }}
                        className={`rounded-2xl p-3.5 border transition-all cursor-pointer relative active:scale-[0.98] ${
                          isSelected
                            ? 'bg-slate-900/95 border-amber-500/60 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30'
                            : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700/80'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Framework / Project Avatar */}
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black shrink-0 shadow-md ${
                              isSelected
                                ? 'bg-gradient-to-tr from-amber-500 to-indigo-600 text-slate-950 shadow-amber-500/20'
                                : 'bg-slate-800 border border-slate-700 text-amber-400'
                            }`}
                          >
                            {repo.name.slice(0, 2).toUpperCase()}
                          </div>

                          {/* Project Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <h3 className="font-extrabold text-sm text-white truncate tracking-tight">
                                {repo.name}
                              </h3>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Pin
                                  className={`w-3.5 h-3.5 ${
                                    isSelected ? 'text-amber-400 fill-amber-400' : 'text-slate-600'
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`Hapus ${repo.name} dari daftar proyek ArtaStudio?`)) {
                                      fetch('/api/workspaces/remove', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ projectPath: repo.defaultPath }),
                                      }).then(() => fetchWorkspaces());
                                    }
                                  }}
                                  className="text-slate-500 hover:text-red-400 p-0.5 rounded transition-colors"
                                  title="Hapus proyek"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Framework & Branch */}
                            <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 border border-slate-700/60">
                                {repo.framework}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                                🌿 {repo.branches.find((b) => b.isCurrent)?.name || repo.branches[0]?.name || 'main'}
                              </span>
                            </div>

                            {/* Timestamp & Dev Status */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[10px] text-slate-500 font-mono">
                              <span className="truncate max-w-[170px] text-slate-400">
                                {repo.repoUrl || repo.defaultPath}
                              </span>
                              <div className="flex items-center gap-1">
                                {isRunning ? (
                                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Aktif
                                  </span>
                                ) : (
                                  <span className="text-slate-500">2 mnt lalu</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Floating Action Button: + Proyek baru (Standar Lovable Image 4) */}
              <button
                onClick={() => setIsAddProjectOpen(true)}
                className="fixed bottom-20 right-4 z-40 px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs shadow-xl shadow-amber-500/20 flex items-center gap-2 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Proyek baru</span>
              </button>

              {/* Floating Bottom Dock Pill (Standar Lovable Image 4) */}
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl rounded-full p-1.5">
                <button
                  onClick={() => setMobileView('projects')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Projects</span>
                </button>

                <button
                  onClick={() => setMobileView('chat')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all text-slate-400 hover:text-white"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat</span>
                </button>

                <button
                  onClick={() => setMobileView('preview')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all text-slate-400 hover:text-white"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Preview</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ========================================================
            DESKTOP VIEW ARCHITECTURE (>= 768px Full Studio Workspace)
            ======================================================== */
        <>
          {/* Top Header */}
          <header className="h-14 border-b border-slate-800/80 bg-[#0f172a]/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-amber-500/10">
                <svg className="w-5 h-5 text-slate-950 font-black fill-current" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base tracking-tight text-white">ArtaStudio</span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">AI Web Development Suite</p>
              </div>
            </div>

            {/* Project Selector & Status */}
            <div className="flex items-center gap-3">
              {/* Workspace & Branch dropdown */}
              <div className="relative flex items-center gap-2">
                <select
                  value={selectedRepo?.id || ''}
                  onChange={(e) => {
                    const repo = workspaces.find((w) => w.id === e.target.value);
                    if (repo) handleSelectWorkspace(repo);
                  }}
                  className="bg-slate-900/90 text-xs text-slate-200 border border-slate-700/60 rounded-md px-3 py-1.5 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer max-w-[170px] truncate"
                >
                  {workspaces.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.name} ({repo.framework})
                    </option>
                  ))}
                </select>

                {selectedRepo && selectedRepo.branches && selectedRepo.branches.length > 1 && (
                  <select
                    value={activeBranch?.path || selectedBranchPath}
                    onChange={(e) => handleSelectBranch(selectedRepo, e.target.value)}
                    className="bg-slate-900/90 text-xs text-amber-400 font-mono border border-slate-700/60 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer max-w-[160px] truncate"
                    title="Pilih cabang / worktree aktif"
                  >
                    {selectedRepo.branches.map((b) => (
                      <option key={b.path} value={b.path}>
                        {b.name}{b.isCurrent ? ' (aktif)' : (b.name === 'main' || b.name === 'master') ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Dev Server Auto-Status Indicator */}
              <div
                className={`text-xs px-3 py-1.5 rounded-md font-medium border flex items-center gap-1.5 ${
                  devStatus?.status === 'running'
                    ? 'bg-emerald-950/40 border-emerald-600/60 text-emerald-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                }`}
                title={devStatus?.status === 'running' ? `Server dev aktif di ${devStatus.url || 'port'}` : 'Memulai server dev otomatis...'}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    devStatus?.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
                  }`}
                />
                <span className="font-mono text-[11px]">
                  {devStatus?.status === 'running' ? `Port :${devStatus.port || (devStatus.url ? devStatus.url.split(':')[2] : 'Aktif')}` : 'Auto-Starting...'}
                </span>
              </div>

              {/* WebSocket Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] border border-slate-800 bg-slate-900/50">
                <span
                  className={`w-2 h-2 rounded-full ${
                    wsConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400 animate-ping'
                  }`}
                />
                <span className="text-slate-400 font-mono text-[10px]">
                  {wsConnected ? 'WS 4000' : 'Menyambung...'}
                </span>
              </div>

              {/* Deploy Button */}
              <button
                onClick={handleOpenSecurityAudit}
                disabled={isDeploying}
                className="text-xs px-3.5 py-1.5 rounded-md font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 hover:from-amber-400 hover:to-amber-500 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeploying ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Publikasi...
                  </>
                ) : (
                  'Publikasi ke Edge'
                )}
              </button>
            </div>
          </header>

          {/* Main 3-Column Studio Workspace */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* Toggle Sidebar Button when collapsed */}
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                title="Buka Sidebar Proyek"
                className="absolute left-2 top-2 z-30 p-1.5 rounded-md bg-slate-900 border border-slate-700 text-slate-300 hover:text-amber-400 hover:border-amber-500/50 shadow-lg transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 6h16M4 12h16M4 18h7"
                  />
                </svg>
              </button>
            )}

            {/* Left Column: Workspace & Git Timeline */}
            {isSidebarOpen && (
              <aside className="w-72 border-r border-slate-800/80 bg-[#0c121e]/90 flex flex-col shrink-0">
                <div className="p-3 border-b border-slate-800/60 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <span>Proyek</span>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      {workspaces.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddProjectOpen(true)}
                      title="Tambah Proyek Baru"
                      className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors"
                    >
                      + Tambah
                    </button>
                  </h3>
                  <button
                    onClick={() => setIsSidebarOpen(false)}
                    title="Tutup / Minimize Sidebar"
                    className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                      />
                    </svg>
                  </button>
                </div>

                {/* Project Workspaces List */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                  {workspaces.map((repo) => {
                    const isSelected = selectedRepo?.id === repo.id;
                    const currentRepoBranch = isSelected
                      ? activeBranch
                      : repo.branches.find((b) => b.isCurrent) ||
                        repo.branches.find((b) => b.name === 'main') ||
                        repo.branches.find((b) => b.name === 'master') ||
                        repo.branches.find((b) => b.name === 'bowhead') ||
                        repo.branches[0];

                    return (
                      <div
                        key={repo.id}
                        onClick={() => handleSelectWorkspace(repo)}
                        className={`rounded-lg p-3 transition-all border cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900/95 border-amber-500/60 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                            : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isSelected ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-slate-600'
                              }`}
                            />
                            <span className="font-extrabold text-sm tracking-tight text-white group-hover:text-amber-400">
                              {repo.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 border border-slate-700/60">
                              {repo.framework}
                            </span>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm(`Hapus ${repo.name} dari daftar proyek ArtaStudio? (Berkas fisik tidak dihapus)`)) {
                                  await fetch('/api/workspaces/remove', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ projectPath: repo.defaultPath }),
                                  });
                                  fetchWorkspaces();
                                }
                              }}
                              title="Hapus / Lepas dari daftar proyek"
                              className="text-slate-500 hover:text-red-400 hover:bg-slate-800 p-0.5 rounded transition-colors text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        <div
                          className="mt-1.5 text-[11px] font-mono text-slate-400 truncate flex items-center gap-1.5"
                          title={repo.repoUrl}
                        >
                          <svg
                            className="w-3.5 h-3.5 text-slate-500 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                            />
                          </svg>
                          <span className="truncate hover:text-slate-200 select-all">{repo.repoUrl}</span>
                        </div>

                        {repo.branches && repo.branches.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-800/60">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                              <span className="font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                                <svg
                                  className="w-3 h-3 text-amber-500/80"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                                  />
                                </svg>
                                Cabang / Worktree
                              </span>
                              <span className="font-mono text-slate-500 bg-slate-950 px-1 py-0.2 rounded border border-slate-800">
                                {repo.branches.length} cabang
                              </span>
                            </div>

                            {repo.branches.length > 1 ? (
                              <div className="relative">
                                <select
                                  value={currentRepoBranch?.path || repo.defaultPath}
                                  onChange={(e) => {
                                    handleSelectWorkspace(repo, e.target.value);
                                  }}
                                  className="w-full bg-slate-950/90 text-xs text-amber-300 font-mono border border-slate-700/80 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer transition-colors"
                                >
                                  {repo.branches.map((b) => (
                                    <option key={b.path} value={b.path}>
                                      {b.name}
                                      {b.isCurrent ? ' (aktif)' : (b.name === 'main' || b.name === 'master') ? ' (default)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 bg-slate-950/60 px-2 py-1 rounded border border-slate-800">
                                <span className="text-emerald-400">🌿</span>
                                <span className="truncate">{repo.branches[0].name}</span>
                                {repo.branches[0].isCurrent && (
                                  <span className="text-[10px] text-emerald-400 ml-auto font-sans font-bold">
                                    aktif
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Git Commits Timeline */}
                <div className="h-56 border-t border-slate-800/60 flex flex-col bg-[#0a0e17]">
                  <div className="p-2.5 border-b border-slate-800/60 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Riwayat Commit
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">HEAD</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                    {commits.length === 0 ? (
                      <div className="text-[11px] text-slate-500 italic p-2">Tidak ada data commit</div>
                    ) : (
                      commits.map((c) => (
                        <div
                          key={c.hash}
                          className="p-1.5 rounded bg-slate-900/60 border border-slate-800/60 text-[11px] hover:border-slate-700"
                        >
                          <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 mb-0.5">
                            <span className="font-mono text-amber-400">{c.shortHash}</span>
                            <span className="capitalize text-indigo-400">{c.type}</span>
                          </div>
                          <p className="truncate text-slate-300 font-medium">{c.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </aside>
            )}

            {/* Center Column: Chat & AI Workspace */}
            {isChatOpen ? (
              <section
                style={{ width: `${chatWidthPercent}%` }}
                className="flex flex-col bg-[#0d1424]/50 border-r border-slate-800/80 relative shrink-0 transition-all duration-75"
              >
                {/* Active Workspace Bar */}
                <div className="h-10 border-b border-slate-800/60 px-4 flex items-center justify-between bg-slate-900/30 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Workspace:</span>
                    <span className="font-semibold text-slate-200">{selectedWorkspace?.name || '-'}</span>
                    {activeBranch?.name && (
                      <button
                        type="button"
                        onClick={() => {
                          setProjectHubInitialTab('git');
                          setIsProjectHubOpen(true);
                        }}
                        title="Buka Pengaturan Git & GitHub"
                        className="text-[11px] font-mono text-amber-400 px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/40 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <span>🌿</span>
                        <span>{activeBranch.name}</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsChatOpen(false)}
                      title="Minimize / Sembunyikan Chat (Preview Layar Penuh)"
                      className="px-2 py-0.5 rounded text-[11px] border border-slate-800 bg-slate-900 hover:border-slate-700 text-slate-400 hover:text-slate-200 flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                      <span>Sembunyikan Chat</span>
                    </button>
                  </div>
                </div>

                {/* Error Sensor Banner */}
                {activeErrors.length > 0 && (
                  <div className="p-3 bg-red-950/40 border-b border-red-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-red-300">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>{activeErrors.length} Temuan Kritis Terdeteksi di Kode/Runtime</span>
                    </div>
                    <button
                      onClick={() => handleTriggerAutoFix(activeErrors[0].id)}
                      disabled={isAutoFixing}
                      className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-semibold text-xs shadow disabled:opacity-50"
                    >
                      {isAutoFixing ? 'Memperbaiki...' : 'Perbaiki Otomatis'}
                    </button>
                  </div>
                )}

                {/* Message Feed */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((m) =>
                    m.type === 'commit' || (m as any).commit ? (
                      <div key={m.id} className="w-full">
                        <CommitCard
                          commit={
                            (m as any).commit || {
                              id: m.id,
                              hash: m.commitHash || m.id,
                              shortHash: (m.commitHash || m.id).slice(0, 7),
                              message: m.text,
                              author: 'Developer',
                              timestamp: new Date(m.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              }),
                              branch: activeBranch?.name || 'main',
                              filesChanged: 1,
                              additions: 0,
                              deletions: 0,
                              isGitHubSync: true,
                              source: 'github',
                            }
                          }
                          onViewDetail={(commit) => {
                            setSelectedCommitDiff(commit);
                            setIsCommitDiffOpen(true);
                          }}
                          onPreview={() => {
                            setMobileView('preview');
                          }}
                          isCurrentPreview={false}
                        />
                      </div>
                    ) : (
                      <div
                        key={m.id}
                        className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {m.sender === 'user' ? 'Pengguna' : 'ArtaStudio AI'}
                          </span>
                          <span className="text-[10px] text-slate-600">
                            {new Date(m.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
                            m.sender === 'user'
                              ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-none shadow-md shadow-amber-500/10'
                              : 'bg-slate-900/90 text-slate-200 border border-slate-800 rounded-tl-none'
                          }`}
                        >
                          {m.text ? (
                            <p className="whitespace-pre-wrap">{m.text}</p>
                          ) : m.sender === 'assistant' && m.status !== 'done' ? (
                            <p className="text-slate-400 italic text-[11px] animate-pulse">
                              Sedang memproses instruksi Anda...
                            </p>
                          ) : null}
                          {/* Collapsible Action Log & Tool Execution Inspector (Ala Orca / Lovable) */}
                          {m.sender === 'assistant' && (
                            <ActionLogInspector
                              actionLogs={m.actionLogs}
                              status={m.status}
                              statusMessage={(m as any).statusMessage}
                              isLatestAssistant={m.id === latestAssistantMsgId}
                            />
                          )}
                        </div>
                      </div>
                    )
                  )}
                  <div ref={chatScrollRef}></div>
                </div>

                {/* Chat Input Form */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-3 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-sm"
                >
                  <div className="relative flex items-center">
                    <textarea
                      value={inputPrompt}
                      onChange={(e) => setInputPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Tanyakan atau instruksikan perubahan kode pada ArtaStudio..."
                      rows={2}
                      className="w-full bg-slate-900 text-xs text-slate-100 placeholder-slate-500 border border-slate-800 rounded-lg p-2.5 pr-20 focus:outline-none focus:border-amber-500 transition-colors resize-none font-sans"
                    />
                    <button
                      type="submit"
                      disabled={!inputPrompt.trim() || isSendingPrompt}
                      className="absolute right-2 bottom-2.5 px-3 py-1.5 rounded-md text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-40 transition-all"
                    >
                      Kirim
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500 px-1">
                    <span>Tekan Enter untuk kirim, Shift + Enter baris baru</span>
                    <button
                      type="button"
                      onClick={() => setShowLogs(!showLogs)}
                      className="hover:text-slate-300 transition-colors"
                    >
                      {showLogs ? 'Sembunyikan Log' : 'Tampilkan Log'}
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            {/* Draggable Split Divider Bar */}
            {isChatOpen && (
              <div
                onMouseDown={() => setIsDragging(true)}
                className="hidden md:flex w-1.5 hover:w-2 bg-slate-800/80 hover:bg-amber-500 cursor-col-resize transition-all z-20 items-center justify-center shrink-0 group select-none"
                title="Tarik untuk geser ukuran Chat vs Preview"
              >
                <div className="w-0.5 h-8 bg-slate-600 group-hover:bg-amber-200 rounded-full" />
              </div>
            )}

            {/* Right Column: Live Preview Viewport */}
            <section className="flex-1 flex flex-col bg-[#0a0f19] relative min-w-0 w-full">
              {/* Button restore chat when minimized */}
              {!isChatOpen && (
                <button
                  onClick={() => setIsChatOpen(true)}
                  title="Buka Kembali Chat AI"
                  className="absolute left-3 top-12 z-30 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-amber-400 hover:text-amber-300 shadow-xl flex items-center gap-1.5 text-xs font-semibold backdrop-blur"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                  </svg>
                  <span>Buka Chat AI</span>
                </button>
              )}

              {/* Viewport Top Toolbar */}
              <div className="h-10 border-b border-slate-800/60 px-3 flex items-center justify-between bg-slate-900/60">
                {/* Left Preview Controls: Project Settings + Device Mode Switcher */}
                <div className="flex items-center gap-2">
                  {/* Tombol Pengaturan Cloud Proyek Ini */}
                  <button
                    onClick={() => setIsProjectHubOpen(true)}
                    title="Pengaturan Cloud Proyek Ini"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border border-slate-800 hover:border-slate-700 text-xs font-medium transition-all shadow-sm group cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-amber-400 transition-transform duration-300 group-hover:rotate-45" />
                    <span className="text-[11px] font-semibold text-slate-200 group-hover:text-amber-400">Lainnya</span>
                  </button>

                  <div className="h-4 w-px bg-slate-800/80" />

                  {/* Device Mode Switcher (Minimalist icons ala Lovable) */}
                  <div className="flex items-center gap-0.5 bg-slate-950/80 p-0.5 rounded-md border border-slate-800">
                    <button
                      onClick={() => setViewportMode('desktop')}
                      className={`p-1.5 rounded transition-all cursor-pointer ${
                        viewportMode === 'desktop'
                          ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                      title="Desktop / Monitor"
                      aria-label="Desktop View"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewportMode('tablet')}
                      className={`p-1.5 rounded transition-all cursor-pointer ${
                        viewportMode === 'tablet'
                          ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                      title="Tablet (768px)"
                      aria-label="Tablet View"
                    >
                      <Tablet className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewportMode('mobile')}
                      className={`p-1.5 rounded transition-all cursor-pointer ${
                        viewportMode === 'mobile'
                          ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                      title="Mobile / HP (375px)"
                      aria-label="Mobile View"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Route Navigator Dropdown */}
                <div className="flex items-center gap-2 flex-1 max-w-sm mx-3 relative">
                  <div className="relative w-full">
                    <button
                      onClick={() => setIsRouteDropdownOpen(!isRouteDropdownOpen)}
                      className="w-full bg-slate-950 text-[11px] font-mono text-slate-200 border border-slate-800 rounded px-2.5 py-1 focus:outline-none hover:border-slate-700 flex items-center justify-between transition-colors shadow-inner"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-amber-400 font-bold">📄</span>
                        <span className="truncate">
                          {currentProjectRoutes.find((r) => r.path === selectedRoutePath)?.label || selectedRoutePath}
                        </span>
                        <span className="text-slate-500 text-[10px]">({selectedRoutePath})</span>
                      </div>
                      <span className="text-[10px] text-slate-400">▾</span>
                    </button>

                    {isRouteDropdownOpen && (
                      <div className="absolute left-0 top-8 z-40 w-64 bg-[#0a0f19] border border-slate-800 rounded-lg shadow-2xl p-1 max-h-72 overflow-y-auto space-y-0.5 animate-in fade-in">
                        {currentProjectRoutes.map((r) => (
                          <button
                            key={r.path}
                            onClick={() => {
                              setSelectedRoutePath(r.path);
                              setIsRouteDropdownOpen(false);
                              const base = previewUrl.split('/')[0] + '//' + previewUrl.split('/')[2];
                              const target = `${base}${r.path}`;
                              setPreviewUrl(target);
                              const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
                              if (iframe) iframe.src = target;
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center justify-between transition-colors ${
                              selectedRoutePath === r.path
                                ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30'
                                : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                            }`}
                          >
                            <span>{r.label}</span>
                            <code className="text-[10px] font-mono text-slate-500">{r.path}</code>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
                      if (iframe) iframe.src = previewUrl;
                    }}
                    className="text-xs text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                    title="Muat Ulang Halaman"
                  >
                    ↻
                  </button>
                </div>

                {/* External Link */}
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-mono text-slate-400 hover:text-amber-400 transition-colors"
                >
                  Buka Tab ↗
                </a>
              </div>

              {/* Iframe Viewport Container */}
              <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#070b12]">
                <div
                  className={`h-full transition-all duration-300 rounded-lg overflow-hidden border border-slate-800 shadow-2xl ${
                    viewportMode === 'desktop'
                      ? 'w-full'
                      : viewportMode === 'tablet'
                      ? 'w-[768px]'
                      : 'w-[375px]'
                  }`}
                >
                  <iframe
                    id="preview-iframe"
                    src={previewUrl}
                    title="ArtaStudio Live Preview"
                    className="w-full h-full border-0 bg-white"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                  />
                </div>
              </div>

              {/* Terminal / Process Logs Drawer */}
              {showLogs && (
                <div className="h-44 border-t border-slate-800 bg-[#060a10] flex flex-col font-mono text-[10px]">
                  <div className="p-1.5 border-b border-slate-800 flex items-center justify-between text-slate-400 px-3">
                    <span className="font-bold">Streaming Terminal / Server Logs</span>
                    <button onClick={() => setLogs([])} className="hover:text-white">
                      Bersihkan
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 text-slate-300 space-y-0.5">
                    {logs.length === 0 ? (
                      <div className="text-slate-600 italic">Menunggu log dari server...</div>
                    ) : (
                      logs.map((l, i) => <div key={i}>{l}</div>)
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {/* ========================================================
          SHARED MODALS (DESKTOP & MOBILE)
          ======================================================== */}
      {/* AI Provider Settings Modal */}
      <AIProviderSettingsModal
        isOpen={isAISettingsOpen}
        onClose={() => setIsAISettingsOpen(false)}
      />

      {/* Security Pre-Flight Audit Modal */}
      <SecurityCheckModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        report={securityReport}
        isLoading={isLoadingSecurity}
        onConfirmDeploy={async () => {
          setIsSecurityModalOpen(false);
          await handleTriggerDeploy();
        }}
        isDeploying={isDeploying}
        onSendToChat={(promptText: string) => {
          setInputPrompt(promptText);
          setMobileView('chat');
        }}
      />

      {/* Add Project Modal */}
      <AddProjectModal
        isOpen={isAddProjectOpen}
        onClose={() => setIsAddProjectOpen(false)}
        onProjectAdded={() => fetchWorkspaces()}
      />

      {/* Studio Project Hub Modal */}
      <StudioProjectHubModal
        isOpen={isProjectHubOpen}
        onClose={() => setIsProjectHubOpen(false)}
        selectedRepo={selectedRepo}
        activeBranchPath={selectedBranchPath || selectedRepo?.defaultPath}
        securityReport={securityReport}
        onOpenSecurityAudit={handleOpenSecurityAudit}
        logs={logs}
        initialTab={projectHubInitialTab}
      />

      {/* Commit Diff Modal */}
      <CommitDiffModal
        isOpen={isCommitDiffOpen}
        commit={selectedCommitDiff}
        onClose={() => setIsCommitDiffOpen(false)}
        onPreviewCommit={() => {
          setIsCommitDiffOpen(false);
          setMobileView('preview');
        }}
      />
      {/* Floating Toast Notifikasi Pojok Kiri Bawah (1:1 Standar Lovable) */}
      {gitToast && (
        <div className="fixed bottom-5 left-5 z-50 flex items-center gap-3 bg-slate-900/95 border border-amber-500/40 text-slate-100 shadow-2xl shadow-amber-500/10 rounded-xl p-3.5 backdrop-blur-md max-w-sm sm:max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
            <GitCommit className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wide">
                Commit Baru Terdeteksi
              </span>
              <span className="font-mono text-[10px] bg-slate-800 text-amber-300 px-1.5 py-0.2 rounded border border-slate-700">
                {gitToast.shortHash}
              </span>
            </div>
            <p className="text-xs text-slate-200 truncate font-medium">
              {gitToast.message}
            </p>
            {gitToast.author && (
              <span className="text-[10px] text-slate-400">
                oleh {gitToast.author}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {gitToast.commit && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCommitDiff(gitToast.commit!);
                  setIsCommitDiffOpen(true);
                  setGitToast(null);
                }}
                className="px-2.5 py-1 text-[11px] font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-all shadow-sm cursor-pointer"
              >
                Detail
              </button>
            )}
            <button
              type="button"
              onClick={() => setGitToast(null)}
              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
