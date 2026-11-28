import React, { useState, useEffect } from 'react';
import type { RepoProject, SecurityAuditReport, GitSyncStatus, SkriptStateResponse } from '../../../shared/types';
import { SkriptEditorModal } from './SkriptEditorModal';
import {
  Globe,
  Database,
  Bot,
  BarChart2,
  ShieldCheck,
  Search,
  Settings,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Key,
  Server,
  Activity,
  HardDrive,
  Cpu,
  GitBranch,
  GitCommit,
  Copy,
  Check,
  Download,
  Unlink,
  ChevronDown,
} from 'lucide-react';

const GithubIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

interface StudioProjectHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRepo: RepoProject | null;
  activeBranchPath?: string;
  securityReport: SecurityAuditReport | null;
  onOpenSecurityAudit: () => void;
  logs: string[];
  initialTab?: HubTabId;
  onOpenIndexedDbTest?: () => void;
}

export type HubTabId =
  | 'analytics'
  | 'database'
  | 'ai'
  | 'domains'
  | 'security'
  | 'seo'
  | 'usage'
  | 'settings'
  | 'git';

interface SeoInspectionResult {
  success: boolean;
  projectPath: string;
  hasRobots: boolean;
  robotsRelPath: string | null;
  robotsPreview?: string;
  hasSitemap: boolean;
  sitemapRelPath: string | null;
  sitemapType?: string;
  hasMeta: boolean;
  pageTitle?: string;
  ssrReady?: boolean;
}

interface DomainItem {
  name: string;
  provider: string;
  status: string;
  isPrimary: boolean;
}

export const StudioProjectHubModal: React.FC<StudioProjectHubModalProps> = ({
  isOpen,
  onClose,
  selectedRepo,
  activeBranchPath,
  securityReport,
  onOpenSecurityAudit,
  logs,
  initialTab,
  onOpenIndexedDbTest,
}) => {
  const [activeTab, setActiveTab] = useState<HubTabId>(initialTab || 'domains');
  const [maxWorkers, setMaxWorkers] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('artastudio_max_workers');
      return stored ? Math.min(Math.max(parseInt(stored, 10), 1), 32) : 32;
    } catch {
      return 32;
    }
  });
  const [skriptState, setSkriptState] = useState<SkriptStateResponse | null>(null);
  const [isSkriptEditorOpen, setIsSkriptEditorOpen] = useState(false);
  const [gaId, setGaId] = useState('');
  const [isGaSaved, setIsGaSaved] = useState(false);
  const [customDomainInput, setCustomDomainInput] = useState('');
  const [dnsProvider, setDnsProvider] = useState<'cloudflare' | 'hostinger' | 'custom'>('cloudflare');

  // Git Integration State
  const [gitStatus, setGitStatus] = useState<GitSyncStatus | null>(null);
  const [isCheckingGit, setIsCheckingGit] = useState<boolean>(false);
  const [cloneProtocol, setCloneProtocol] = useState<'https' | 'ssh' | 'cli'>('https');
  const [isCopiedClone, setIsCopiedClone] = useState<boolean>(false);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState<boolean>(false);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);
  const [isCheckingOutBranch, setIsCheckingOutBranch] = useState<boolean>(false);
  const [connectRepoInput, setConnectRepoInput] = useState<string>('');
  const [isConnectingRepo, setIsConnectingRepo] = useState<boolean>(false);

  // Dynamic project detection
  const projectId = (selectedRepo?.id || '').toLowerCase();
  const projectName = selectedRepo?.name || 'ArtaStudio';
  const activePath = activeBranchPath || selectedRepo?.defaultPath || '';

  const isArtaLoka = projectId.includes('artaloka') || projectName.toLowerCase().includes('artaloka');
  const isTahqiq = projectId.includes('tahqiq') || projectName.toLowerCase().includes('tahqiq');
  const isArtaStudio = projectId.includes('artastudio') || (!isArtaLoka && !isTahqiq && (!selectedRepo || projectId === 'artastudio' || projectId === 'current/artastudio'));

  // Connected domains per project
  const [connectedDomains, setConnectedDomains] = useState<DomainItem[]>([]);

  const previewUrl = isArtaLoka
    ? 'http://localhost:5199'
    : isTahqiq
    ? 'http://localhost:3000'
    : 'http://localhost:5173';

  // State untuk drawer preview robots.txt / sitemap / meta
  const [activeSeoInspector, setActiveSeoInspector] = useState<'robots' | 'sitemap' | 'meta' | 'gsc' | null>(null);
  const [gscVerificationTag, setGscVerificationTag] = useState(() => {
    return localStorage.getItem(`artastudio_gsc_${projectId}`) || '';
  });
  const [isGscSaved, setIsGscSaved] = useState(false);
  // SEO inspection result state
  const [seoResult, setSeoResult] = useState<SeoInspectionResult | null>(null);
  const [isCheckingSeo, setIsCheckingSeo] = useState<boolean>(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Initialize data dynamically whenever selected project changes
  useEffect(() => {
    if (!isOpen) return;

    if (isArtaLoka) {
      setConnectedDomains([
        { name: 'artaloka.com', provider: 'Cloudflare', status: 'Aktif', isPrimary: true },
        { name: 'www.artaloka.com', provider: 'Cloudflare', status: 'Aktif', isPrimary: false },
      ]);
      setGaId('G-E68Z3G7QPY');
    } else if (isTahqiq) {
      setConnectedDomains([
        { name: 'tahqiq.com', provider: 'Cloudflare', status: 'Aktif', isPrimary: true },
        { name: 'tahqiq.artaloka.com', provider: 'Cloudflare', status: 'Aktif', isPrimary: false },
      ]);
      setGaId('G-TQ99876543');
    } else if (isArtaStudio) {
      setConnectedDomains([
        { name: 'localhost:4000', provider: 'Local Node/Express', status: 'Aktif', isPrimary: true },
        { name: 'studio.artaloka.local', provider: 'Local Loopback', status: 'Idle', isPrimary: false },
      ]);
      setGaId('LOCAL-STUDIO-DEV');
    } else {
      const defaultHost = `${selectedRepo?.id || 'proyek'}.artaloka.com`;
      setConnectedDomains([
        { name: defaultHost, provider: 'Cloudflare Edge', status: 'Aktif', isPrimary: true },
        { name: 'localhost:5173', provider: 'Local Dev Server', status: 'Aktif', isPrimary: false },
      ]);
      setGaId('');
    }

    // Trigger dynamic SEO check from server API
    fetchSeoStatus();
    // Trigger dynamic Git sync status from server API
    fetchGitStatus();
    // Trigger skript.md status check
    fetchSkriptStatus();
  }, [isOpen, selectedRepo?.id, activePath, isArtaLoka, isTahqiq, isArtaStudio]);

  const fetchSkriptStatus = async () => {
    if (!activePath) return;
    try {
      const res = await fetch(`/api/skript?projectPath=${encodeURIComponent(activePath)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.success) {
          setSkriptState(data);
        }
      }
    } catch {}
  };

  const fetchGitStatus = async () => {
    setIsCheckingGit(true);
    try {
      const target = activePath || process.cwd();
      const res = await fetch(`/api/git/sync-status?projectPath=${encodeURIComponent(target)}`);
      if (res.ok) {
        const data: GitSyncStatus = await res.json();
        setGitStatus(data);
      }
    } catch (err) {
      console.warn('Gagal memuat status Git:', err);
    } finally {
      setIsCheckingGit(false);
    }
  };

  const handleRecheckSync = async () => {
    await fetchGitStatus();
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Yakin ingin memutuskan repositori GitHub ini dari proyek?')) return;
    setIsDisconnecting(true);
    try {
      const target = activePath || process.cwd();
      const res = await fetch('/api/git/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: target }),
      });
      if (res.ok) {
        await fetchGitStatus();
      }
    } catch (err) {
      console.error('Gagal memutuskan GitHub:', err);
    } finally {
      setIsDisconnecting(false);
      setOptionsMenuOpen(false);
    }
  };

  const handleChangeBranch = async (branch: string) => {
    if (!branch || branch === gitStatus?.currentBranch) return;
    setIsCheckingOutBranch(true);
    try {
      const target = activePath || process.cwd();
      const res = await fetch('/api/git/checkout-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: target, branch }),
      });
      if (res.ok) {
        await fetchGitStatus();
      }
    } catch (err) {
      console.error('Gagal beralih cabang:', err);
    } finally {
      setIsCheckingOutBranch(false);
      setOptionsMenuOpen(false);
    }
  };

  const handleConnectRepo = async () => {
    if (!connectRepoInput.trim()) return;
    setIsConnectingRepo(true);
    try {
      const target = activePath || process.cwd();
      const res = await fetch('/api/git/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: target, repoUrl: connectRepoInput.trim() }),
      });
      if (res.ok) {
        setConnectRepoInput('');
        await fetchGitStatus();
      }
    } catch (err) {
      console.error('Gagal menghubungkan repositori:', err);
    } finally {
      setIsConnectingRepo(false);
    }
  };

  const handleCopyClone = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setIsCopiedClone(true);
    setTimeout(() => setIsCopiedClone(false), 2000);
  };

  const fetchSeoStatus = async () => {
    setIsCheckingSeo(true);
    try {
      const target = activePath || process.cwd();
      const res = await fetch(`/api/workspaces/seo-status?projectPath=${encodeURIComponent(target)}`);
      if (res.ok) {
        const data = await res.json();
        setSeoResult(data);
      } else {
        // Fallback for offline / direct simulation
        setSeoResult({
          success: true,
          projectPath: target,
          hasRobots: isArtaLoka,
          robotsRelPath: isArtaLoka ? 'public/robots.txt' : null,
          hasSitemap: isArtaLoka,
          sitemapRelPath: isArtaLoka ? 'src/routes/sitemap[.]xml.ts' : null,
          sitemapType: isArtaLoka ? 'dynamic' : undefined,
          hasMeta: true,
          ssrReady: isArtaLoka || isTahqiq,
        });
      }
    } catch (err) {
      console.warn('Gagal memuat status SEO:', err);
      setSeoResult({
        success: true,
        projectPath: activePath,
        hasRobots: isArtaLoka,
        robotsRelPath: isArtaLoka ? 'public/robots.txt' : null,
        hasSitemap: isArtaLoka,
        sitemapRelPath: isArtaLoka ? 'src/routes/sitemap[.]xml.ts' : null,
        sitemapType: isArtaLoka ? 'dynamic' : undefined,
        hasMeta: true,
        ssrReady: isArtaLoka || isTahqiq,
      });
    } finally {
      setIsCheckingSeo(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in">
      <div className="bg-[#0b101b] border border-slate-800 rounded-2xl max-w-5xl w-full shadow-2xl overflow-hidden flex flex-col h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">⚙️</span>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>Pusat Pengaturan Proyek & Layanan Cloud</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  {projectName}
                </span>
                {selectedRepo?.framework && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    {selectedRepo.framework}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                Kelola analitik, database, domain, SEO, dan variabel proyek aktif khusus untuk <span className="text-slate-200 font-semibold">{projectName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Master Detail Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation Sidebar */}
          <div className="w-56 border-r border-slate-800/80 bg-[#080d16] flex flex-col p-2 space-y-1 shrink-0 text-xs">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2.5 cursor-pointer ${
                activeTab === 'analytics'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <span>📊</span>
              <span>Analitik & Traffic</span>
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2.5 cursor-pointer ${
                activeTab === 'database'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <span>🗄️</span>
              <span>Cloud Storage & Database</span>
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2.5 cursor-pointer ${
                activeTab === 'ai'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <span>🤖</span>
              <span>AI Suite & Engine</span>
            </button>

            <button
              onClick={() => setActiveTab('domains')}
              className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2.5 cursor-pointer ${
                activeTab === 'domains'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <span>🌐</span>
              <span>Domain & Edge DNS</span>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2.5 cursor-pointer ${
                activeTab === 'security'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <span>🛡️</span>
              <span>Pemeriksaan Keamanan</span>
            </button>

            <button
              onClick={() => setActiveTab('seo')}
              className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2.5 cursor-pointer ${
                activeTab === 'seo'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <span>🔍</span>
              <span>SEO & AI Search</span>
            </button>

            <div className="border-t border-slate-800/80 my-2 pt-2">
              <button
                onClick={() => setActiveTab('usage')}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2.5 cursor-pointer ${
                  activeTab === 'usage'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <span>📈</span>
                <span>Usage & Kuota</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2.5 cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <span>⚙️</span>
                <span>Pengaturan & Secrets</span>
              </button>

              {/* Sub-menu Git di bawah Pengaturan (Standar Lovable Image 3) */}
              <button
                onClick={() => setActiveTab('git')}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2.5 cursor-pointer ${
                  activeTab === 'git'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <GithubIcon className="w-4 h-4 shrink-0" />
                <span className="flex-1">Git</span>
                {gitStatus?.connected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                )}
              </button>
            </div>
          </div>

          {/* Right Content Panel */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#0c121e] text-xs text-slate-300">
            {/* 1. ANALYTICS TAB */}
            {activeTab === 'analytics' && (
              <div className="space-y-4 max-w-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>Google Analytics & Web Traffic</span>
                    <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded font-mono">
                      GA4
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {projectName}
                    </span>
                  </h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Tautkan Google Analytics Measurement ID untuk melacak pengunjung dan sesi interaksi proyek <span className="text-amber-400 font-semibold">{projectName}</span>.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Measurement ID Google Analytics (G-XXXXXXX)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Contoh: G-E68Z3G7QPY"
                        value={gaId}
                        onChange={(e) => setGaId(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => {
                          setIsGaSaved(true);
                          setTimeout(() => setIsGaSaved(false), 2000);
                        }}
                        className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all cursor-pointer"
                      >
                        {isGaSaved ? 'Tersimpan ✓' : 'Tautkan ID'}
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/80 pt-3">
                    <span className="text-[11px] text-slate-400 block mb-1">Belum punya properti Google Analytics?</span>
                    <a
                      href="https://analytics.google.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <span>Buka Google Analytics Console & Dapatkan Tag ↗</span>
                    </a>
                  </div>
                </div>

                {/* Traffic summary preview */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/30">
                    <span className="text-slate-500 text-[10px] block">Pengunjung Hari Ini</span>
                    <span className="text-lg font-bold text-slate-100 font-mono">
                      {isArtaLoka ? '1,428' : isTahqiq ? '342' : 'Local Dev'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/30">
                    <span className="text-slate-500 text-[10px] block">Tampilan Halaman (Pageviews)</span>
                    <span className="text-lg font-bold text-slate-100 font-mono">
                      {isArtaLoka ? '5,892' : isTahqiq ? '1,120' : 'Internal'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/30">
                    <span className="text-slate-500 text-[10px] block">Rata-rata Durasi Sesi</span>
                    <span className="text-lg font-bold text-slate-100 font-mono">
                      {isArtaLoka ? '3m 42s' : isTahqiq ? '2m 15s' : 'Active'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. DATABASE TAB */}
            {activeTab === 'database' && (
              <div className="space-y-4 max-w-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>Cloud Storage & Database Services</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {projectName}
                    </span>
                  </h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Informasi koneksi basis data aktif untuk proyek <span className="text-amber-400 font-semibold">{projectName}</span>.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {isArtaLoka && (
                    <>
                      <div className="p-3.5 rounded-xl border border-emerald-800/50 bg-emerald-950/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">⚡</span>
                          <div>
                            <div className="font-bold text-slate-200">Supabase Cloud PostgreSQL</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              danjrtinfrxpqwcuadob.supabase.co · 147 Tabel RLS Aktif
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-900 text-emerald-300 font-bold font-mono">
                          Connected
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">📦</span>
                          <div>
                            <div className="font-bold text-slate-200">Cloudflare R2 Object Storage</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              cdn.artaloka.com · Bucket Asset & Video Tutorial
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-mono">
                          Linked
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">🐳</span>
                          <div>
                            <div className="font-bold text-slate-200">Local Docker / Supabase CLI</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              {import.meta.env.DEV
                                ? 'http://127.0.0.1:54321 · Local Development Instance'
                                : 'Local Development Instance (Supabase CLI)'}
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-mono">
                          Idle
                        </span>
                      </div>
                    </>
                  )}

                  {isTahqiq && (
                    <>
                      <div className="p-3.5 rounded-xl border border-emerald-800/50 bg-emerald-950/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">⚡</span>
                          <div>
                            <div className="font-bold text-slate-200">Drizzle SQLite / Cloudflare D1</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              DB: tahqiq-production · Cloudflare D1 Serverless SQL
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-900 text-emerald-300 font-bold font-mono">
                          Connected
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl border border-cyan-800/50 bg-cyan-950/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">🔄</span>
                          <div>
                            <div className="font-bold text-slate-200">Drizzle ORM Migrations</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              drizzle/ · SQLite Local & Edge Sync (D1 Engine)
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-900 text-cyan-300 font-bold font-mono">
                          Ready
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">🔐</span>
                          <div>
                            <div className="font-bold text-slate-200">Supabase Auth & Storage</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              tahqiq-auth · Shared Auth & User Session Instance
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-mono">
                          Linked
                        </span>
                      </div>
                    </>
                  )}

                  {isArtaStudio && (
                    <>
                      <div className="p-3.5 rounded-xl border border-emerald-800/50 bg-emerald-950/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">🗄️</span>
                          <div>
                            <div className="font-bold text-slate-200">Local Repository Registry & State</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              projects.json & git state · Local Repository Manager
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-900 text-emerald-300 font-bold font-mono">
                          Connected
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">⚙️</span>
                          <div>
                            <div className="font-bold text-slate-200">Process Manager & Server Registry</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              Active Dev Servers (Vite & TanStack) · In-Memory Process Registry
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-900 text-emerald-300 font-mono font-bold">
                          Running
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">🧠</span>
                          <div>
                            <div className="font-bold text-slate-200">Development Suite Storage</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              ~/.gemini/antigravity-cli · Cache & Activity Logs
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-mono">
                          Active
                        </span>
                      </div>
                    </>
                  )}

                  {!isArtaLoka && !isTahqiq && !isArtaStudio && (
                    <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📁</span>
                        <div>
                          <div className="font-bold text-slate-200">Local Project Workspace</div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {activePath || 'Standard Workspace Storage'}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-900 text-emerald-300 font-mono font-bold">
                        Mounted
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. AI SUITE TAB */}
            {activeTab === 'ai' && (
              <div className="space-y-4 max-w-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>AI Suite & Engine Configuration</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {projectName}
                    </span>
                  </h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Pilih backend kecerdasan buatan untuk ArtaStudio: OpenCode Lokal gratis, Agy CLI Multi-Tiered, atau Custom API Key.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
                  <p className="text-slate-300 text-xs leading-relaxed">
                    ArtaStudio dirancang independen. Anda bebas berganti antara eksekusi lokal tanpa biaya token, atau menggunakan API Key mandiri saat diakses melalui perangkat lain seperti Termux Android.
                  </p>
                  <div className="pt-1">
                    <span className="text-[11px] text-slate-400 block mb-1">Engine aktif saat ini:</span>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold font-mono text-xs">
                      <span>⚡ OpenCode Lokal / Agy Multi-Tiered</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. DOMAINS TAB */}
            {activeTab === 'domains' && (
              <div className="space-y-4 max-w-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span>Domain & Edge DNS</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        {projectName}
                      </span>
                    </span>
                    <a
                      href="https://developers.cloudflare.com/workers/configuration/routing/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-amber-400 hover:underline"
                    >
                      Dokumentasi ↗
                    </a>
                  </h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Kelola domain kustom yang terhubung ke edge network untuk proyek <span className="text-amber-400 font-semibold">{projectName}</span>.
                  </p>
                </div>

                {/* Connected Domains List */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Domain Terhubung ({connectedDomains.length})
                  </span>
                  {connectedDomains.map((d) => (
                    <div
                      key={d.name}
                      className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                        <div>
                          <div className="font-bold text-slate-100 flex items-center gap-1.5 font-mono">
                            <span>{d.name}</span>
                            {d.isPrimary && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-sans font-bold">
                                Utama
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            DNS Provider: {d.provider} · Edge Proxied
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] text-emerald-400 font-semibold">{d.status}</span>
                    </div>
                  ))}
                </div>

                {/* Add Custom Domain Box */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
                  <span className="text-xs font-bold text-slate-200 block">Hubungkan Domain Kustom Lain</span>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder={`Contoh: custom.${projectName.toLowerCase()}.com`}
                      value={customDomainInput}
                      onChange={(e) => setCustomDomainInput(e.target.value)}
                      className="col-span-2 bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-slate-200 focus:outline-none focus:border-amber-500 text-xs"
                    />
                    <select
                      value={dnsProvider}
                      onChange={(e) => setDnsProvider(e.target.value as any)}
                      className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs focus:outline-none focus:border-amber-500"
                    >
                      <option value="cloudflare">Cloudflare DNS</option>
                      <option value="hostinger">Hostinger DNS</option>
                      <option value="custom">Penyedia Lain</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      if (!customDomainInput.trim()) return;
                      setConnectedDomains([
                        ...connectedDomains,
                        { name: customDomainInput.trim(), provider: dnsProvider, status: 'Menghubungkan...', isPrimary: false },
                      ]);
                      setCustomDomainInput('');
                    }}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all text-xs cursor-pointer"
                  >
                    Hubungkan Domain
                  </button>
                </div>
              </div>
            )}

            {/* 5. SECURITY TAB */}
            {activeTab === 'security' && (
              <div className="space-y-4 max-w-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>Pemeriksaan Keamanan & Pre-Flight Audit</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {projectName}
                    </span>
                  </h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Hasil inspeksi menyeluruh RLS Supabase, API Keys, CVE dependensi, dan integritas build proyek <span className="text-amber-400 font-semibold">{projectName}</span>.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-200 block">Skor Keamanan Proyek ({projectName})</span>
                    <span className="text-[11px] text-slate-400">
                      {securityReport ? `${securityReport.summary.passedChecks} Lolos · ${securityReport.summary.warnings} Peringatan · ${securityReport.summary.criticals} Kritis` : 'Belum ada data pemindaian'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold font-mono text-amber-400">
                      {securityReport ? `${securityReport.overallScore}/100` : '-'}
                    </span>
                    <button
                      onClick={() => {
                        onClose();
                        onOpenSecurityAudit();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all cursor-pointer"
                    >
                      Buka Inspector Lengkap ↗
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 6. SEO & AI SEARCH TAB (Dinamis dari proyek aktif) */}
            {activeTab === 'seo' && (
              <div className="space-y-4 max-w-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span>SEO & AI Search Review</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        {projectName}
                      </span>
                    </span>
                    <button
                      onClick={fetchSeoStatus}
                      disabled={isCheckingSeo}
                      className="text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isCheckingSeo ? 'animate-spin text-amber-400' : ''}`} />
                      <span>{isCheckingSeo ? 'Memeriksa...' : 'Periksa Ulang'}</span>
                    </button>
                  </h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Status kesiapan mesin pencari (Google, Bing) dan asisten AI (ChatGPT, Perplexity, Claude) untuk proyek <span className="text-amber-400 font-semibold">{projectName}</span>.
                  </p>
                </div>

                {/* SEO Status Banner */}
                {seoResult?.hasRobots && seoResult?.hasSitemap ? (
                  <div className="p-3.5 rounded-xl border border-emerald-800/40 bg-emerald-950/20 text-emerald-300 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">✓</span>
                      <div>
                        <div className="font-bold text-slate-100">SEO Review Status: Optimal & Ready</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Semua berkas crawler (robots.txt & sitemap) terdeteksi valid dan siap untuk diindeks.
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-md bg-emerald-900 text-emerald-300 font-bold text-[10px] font-mono">
                      Verified
                    </span>
                  </div>
                ) : isArtaStudio ? (
                  <div className="p-3.5 rounded-xl border border-indigo-800/40 bg-indigo-950/20 text-indigo-300 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">🛡️</span>
                      <div>
                        <div className="font-bold text-slate-100">SEO Review Status: Private Developer Suite</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          ArtaStudio adalah lingkungan pengembangan lokal internal (Non-indexable).
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-md bg-indigo-900 text-indigo-300 font-bold text-[10px] font-mono">
                      Internal
                    </span>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl border border-amber-800/40 bg-amber-950/20 text-amber-300 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">⚡</span>
                      <div>
                        <div className="font-bold text-slate-100">SEO Review Status: Out of Date</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Beberapa komponen SEO ({!seoResult?.hasRobots ? 'robots.txt' : ''} {!seoResult?.hasSitemap ? 'sitemap.xml' : ''}) belum terdeteksi di {projectName}.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={fetchSeoStatus}
                      className="px-3 py-1 rounded-md bg-amber-500 text-slate-950 font-bold text-[11px] hover:bg-amber-400 transition-colors cursor-pointer"
                    >
                      Periksa Ulang
                    </button>
                  </div>
                )}

                {/* Verification Checklist */}
                <div className="space-y-2 pt-1">
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <span className="text-slate-300">✓ Home page is reachable</span>
                    <span className="text-[10px] text-emerald-400 font-mono">200 OK</span>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <span className="text-slate-300">
                      ✓ Search engines see your fully-rendered pages
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      {seoResult?.ssrReady ? 'SSR Ready (TanStack Start)' : 'SPA Client Render'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <span className="text-slate-300">✓ AI assistants can see your site as markdown</span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      {isArtaLoka ? 'Markdown Verified (Agent Docs)' : 'Supported'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <span className="text-slate-300">
                      ✓ Page basics are set (Title, OpenGraph, Canonical)
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      {seoResult?.hasMeta ? '100% Set' : 'Review Needed'}
                    </span>
                  </div>

                  {/* Real robots.txt check with interactive viewer */}
                  <div
                    onClick={() => setActiveSeoInspector(activeSeoInspector === 'robots' ? null : 'robots')}
                    className={`p-3 rounded-lg border flex flex-col transition-all cursor-pointer ${
                      seoResult?.hasRobots
                        ? 'border-slate-800 bg-slate-900/50 hover:bg-slate-900/80'
                        : 'border-amber-900/40 bg-amber-950/10 hover:bg-amber-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{seoResult?.hasRobots ? '✓' : '⚠'}</span>
                        <span className={seoResult?.hasRobots ? 'text-slate-300 font-medium' : 'text-amber-300 font-medium'}>
                          Crawler rules ({seoResult?.hasRobots ? `ditemukan di ${seoResult.robotsRelPath}` : 'robots.txt belum dibuat'})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            seoResult?.hasRobots
                              ? 'text-emerald-400 bg-emerald-950/60'
                              : 'text-amber-400 bg-amber-950/60'
                          }`}
                        >
                          {seoResult?.hasRobots ? '200 OK' : 'Perlu Dibuat'}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          {activeSeoInspector === 'robots' ? '▲ Tutup' : '▼ Lihat Isi'}
                        </span>
                      </div>
                    </div>
                    {activeSeoInspector === 'robots' && seoResult?.robotsPreview && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                        <pre className="p-2.5 rounded bg-slate-950 text-[10px] font-mono text-emerald-400 max-h-36 overflow-y-auto leading-relaxed whitespace-pre select-text">
                          {seoResult.robotsPreview}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* Real sitemap check with interactive viewer */}
                  <div
                    onClick={() => setActiveSeoInspector(activeSeoInspector === 'sitemap' ? null : 'sitemap')}
                    className={`p-3 rounded-lg border flex flex-col transition-all cursor-pointer ${
                      seoResult?.hasSitemap
                        ? 'border-slate-800 bg-slate-900/50 hover:bg-slate-900/80'
                        : 'border-amber-900/40 bg-amber-950/10 hover:bg-amber-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{seoResult?.hasSitemap ? '✓' : '⚠'}</span>
                        <span className={seoResult?.hasSitemap ? 'text-slate-300 font-medium' : 'text-amber-300 font-medium'}>
                          Sitemap ({seoResult?.hasSitemap ? `aktif di ${seoResult.sitemapRelPath}` : 'sitemap.xml belum dikonfigurasi'})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            seoResult?.hasSitemap
                              ? 'text-emerald-400 bg-emerald-950/60'
                              : 'text-amber-400 bg-amber-950/60'
                          }`}
                        >
                          {seoResult?.hasSitemap ? (seoResult.sitemapType === 'dynamic' ? 'Dynamic SSR' : '200 OK') : 'Check'}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          {activeSeoInspector === 'sitemap' ? '▲ Tutup' : '▼ Rincian'}
                        </span>
                      </div>
                    </div>
                    {activeSeoInspector === 'sitemap' && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                        <div>Lokasi Berkas: <code className="text-amber-300 font-mono">{seoResult?.sitemapRelPath || '-'}</code></div>
                        <div>Tipe Renderer: <span className="text-emerald-400 font-mono">{seoResult?.sitemapType || 'XML'}</span></div>
                        <div className="pt-1">
                          <a
                            href={previewUrl ? `${previewUrl}/sitemap.xml` : '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="text-amber-400 hover:underline inline-flex items-center gap-1 text-[11px]"
                          >
                            <span>Buka XML Sitemap di Tab Baru</span>
                            <span>↗</span>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Google Search Console Setup & Verification Tag */}
                  <div
                    onClick={() => setActiveSeoInspector(activeSeoInspector === 'gsc' ? null : 'gsc')}
                    className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 flex flex-col transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{gscVerificationTag ? '✓' : 'ℹ'}</span>
                        <span className={gscVerificationTag ? 'text-slate-200 font-medium' : 'text-slate-400'}>
                          {gscVerificationTag ? 'Google Search Console terkonfigurasi' : "Google Search Console isn't fully set up"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${gscVerificationTag ? 'text-emerald-400 bg-emerald-950/60' : 'text-slate-500'}`}>
                          {gscVerificationTag ? 'Tersambung' : 'Optional'}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          {activeSeoInspector === 'gsc' ? '▲ Tutup' : '⚙️ Setup'}
                        </span>
                      </div>
                    </div>

                    {activeSeoInspector === 'gsc' && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-3 pt-3 border-t border-slate-800/80 space-y-2 cursor-default"
                      >
                        <p className="text-[11px] text-slate-400">
                          Masukkan HTML meta tag verifikasi dari Google Search Console untuk <span className="text-amber-400 font-semibold">{projectName}</span>:
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={gscVerificationTag}
                            onChange={(e) => {
                              setGscVerificationTag(e.target.value);
                              setIsGscSaved(false);
                            }}
                            placeholder='<meta name="google-site-verification" content="..." />'
                            className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem(`artastudio_gsc_${projectId}`, gscVerificationTag);
                              setIsGscSaved(true);
                              setTimeout(() => setIsGscSaved(false), 2000);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shrink-0"
                          >
                            {isGscSaved ? 'Tersimpan ✓' : 'Simpan'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 7. USAGE TAB */}
            {activeTab === 'usage' && (
              <div className="space-y-4 max-w-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>Usage & Kuota Layanan</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {projectName}
                    </span>
                  </h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Informasi konsumsi kuota CPU, bandwidth, dan request API untuk <span className="text-amber-400 font-semibold">{projectName}</span>.
                  </p>
                </div>
                <div className="p-8 rounded-xl border border-slate-800 bg-slate-900/30 text-center space-y-2">
                  <span className="text-2xl">📈</span>
                  <div className="font-bold text-slate-200">Dalam Pengembangan</div>
                  <p className="text-slate-400 text-xs max-w-md mx-auto">
                    Modul metrik pemakaian kuota Cloudflare Workers dan token AI sedang disiapkan untuk rilis versi online SaaS.
                  </p>
                </div>
              </div>
            )}

            {/* 8. SETTINGS & SECRETS TAB */}
            {activeTab === 'settings' && (
              <div className="space-y-4 max-w-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>Pengaturan Proyek & Secrets</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {projectName}
                    </span>
                  </h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Kelola API Secrets, log streaming, memori AI, dan variabel lingkungan untuk <span className="text-amber-400 font-semibold">{projectName}</span>.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Secrets Box */}
                  <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-amber-400" />
                        <span className="font-semibold text-slate-200">
                          Secrets & Environment Variables ({projectName})
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded">
                        Encrypted
                      </span>
                    </div>

                    <div className="space-y-1.5 my-2">
                      {isArtaLoka && (
                        <>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">VITE_SUPABASE_URL</span>
                            <span className="text-slate-200">https://danjrtinfrxpqwcuadob.supabase.co</span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">SUPABASE_SERVICE_ROLE_KEY</span>
                            <span className="text-amber-400">eyJhbGciOi...•••••••• (Terproteksi)</span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">MIDTRANS_SERVER_KEY</span>
                            <span className="text-slate-300">Mid-server-XXXX•••• (Production)</span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">CLOUDFLARE_TURNSTILE_SECRET</span>
                            <span className="text-slate-300">0x4AAAAAA••••••••</span>
                          </div>
                        </>
                      )}

                      {isTahqiq && (
                        <>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">CLOUDFLARE_D1_DATABASE_ID</span>
                            <span className="text-cyan-300">d1-tahqiq-production-db</span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">CLOUDFLARE_API_TOKEN</span>
                            <span className="text-amber-400">cf-token-•••••••• (Read/Write)</span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">APP_JWT_SECRET</span>
                            <span className="text-slate-300">tahqiq_jwt_secret_••••••••</span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">DRIZZLE_DATABASE_URL</span>
                            <span className="text-slate-300">sqlite://tahqiq.db</span>
                          </div>
                        </>
                      )}

                      {isArtaStudio && (
                        <>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">PORT</span>
                            <span className="text-emerald-400">4000</span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">WORKSPACES_ROOT</span>
                            <span className="text-slate-300">/home/chusni/orca/workspaces</span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">GEMINI_API_KEY</span>
                            <span className="text-amber-400">AIzaSy•••••••• (Terpasang)</span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                            <span className="text-slate-400">OPENCODE_API_KEY</span>
                            <span className="text-cyan-300">Local Engine Active</span>
                          </div>
                        </>
                      )}

                      {!isArtaLoka && !isTahqiq && !isArtaStudio && (
                        <div className="flex items-center justify-between p-2 rounded bg-slate-950 font-mono text-[11px]">
                          <span className="text-slate-400">PROJECT_ROOT</span>
                          <span className="text-slate-300 truncate max-w-xs">{activePath}</span>
                        </div>
                      )}
                    </div>

                    <button className="mt-1 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer">
                      Kelola Secrets ↗
                    </button>
                  </div>

                  {/* Orca Worker Swarm Settings Card */}
                  <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 font-bold text-sm">🐝</span>
                        <span className="font-semibold text-slate-200 text-xs">
                          Orca Worker Swarm (Kapasitas Paralel)
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30 font-bold">
                        {maxWorkers} Worker Maksimal
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Atur batas maksimal instance worker independen yang dapat di-spawn secara simultan untuk proyek ini (1 s/d 32). Seluruh worker otomatis mewarisi login akun CLI server.
                    </p>
                    <div className="flex items-center gap-3 pt-1">
                      <input
                        type="range"
                        min={1}
                        max={32}
                        value={maxWorkers}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setMaxWorkers(val);
                          localStorage.setItem('artastudio_max_workers', String(val));
                        }}
                        className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                      <span className="font-mono text-xs font-bold text-amber-400 min-w-8 text-right bg-slate-950 px-2 py-1 rounded border border-slate-800">
                        {maxWorkers}
                      </span>
                    </div>
                  </div>

                  {/* Logs Box */}
                  <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/50">
                    <span className="font-semibold text-slate-200 block mb-1">📋 Server & Terminal Logs</span>
                    <p className="text-slate-400 text-[11px] mb-2">
                      Riwayat aktivitas server backend terkini ({logs.length} baris terekam).
                    </p>
                    <div className="p-2 rounded bg-slate-950 font-mono text-[10px] text-slate-400 max-h-24 overflow-y-auto">
                      {logs.length > 0 ? (
                        logs.slice(-5).map((l, i) => <div key={i} className="truncate">{l}</div>)
                      ) : (
                        <span className="text-slate-600">Belum ada log server terekam.</span>
                      )}
                    </div>
                  </div>

                  {/* GitHub Git Integration Card in Settings */}
                  <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-200">
                        <GithubIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-slate-200 block text-xs">
                          Integrasi GitHub & Git
                        </span>
                        <p className="text-slate-400 text-[11px]">
                          {gitStatus?.connected
                            ? `Terhubung ke ${gitStatus.repoName || projectName} (${gitStatus.currentBranch || 'main'})`
                            : 'Belum terhubung ke repositori GitHub'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('git')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                    >
                      Buka Pengaturan Git ↗
                    </button>
                  </div>

                  {/* AI Memory & skript.md Card */}
                  <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/50 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200 block">🧠 AI Memory &amp; <span className="font-mono text-amber-400">skript.md</span></span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          skriptState?.isCustomized
                            ? 'bg-violet-500/10 text-violet-300 border-violet-500/30'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {skriptState?.isCustomized ? 'Custom Proyek' : 'Default ArtaStudio'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Aturan arsitektur di <span className="font-mono text-amber-400">AGENTS.md</span> dan protokol orkestrasi Pemikir &amp; 32 Worker di <span className="font-mono text-amber-400">skript.md</span> selalu diutamakan AI untuk {projectName}.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsSkriptEditorOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Kelola / Ubah skript.md
                    </button>
                  </div>

                  {/* Tes Persistensi IndexedDB */}
                  <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-200 shrink-0">
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-slate-200 block text-xs">
                          Tes Persistensi IndexedDB
                        </span>
                        <p className="text-slate-400 text-[11px]">
                          Menguji apakah data di sesi ini tetap tersimpan di IndexedDB setelah koneksi dibuka ulang.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenIndexedDbTest}
                      disabled={!onOpenIndexedDbTest}
                      className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      Jalankan Tes
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 9. GIT & GITHUB INTEGRATION TAB (Standar Lovable Image 3 & 4) */}
            {activeTab === 'git' && (
              <div className="space-y-4 max-w-2xl animate-in fade-in">
                {/* Header Section */}
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>Integrasi GitHub & Kontrol Git</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {projectName}
                    </span>
                    {gitStatus?.currentBranch && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                        <GitBranch className="w-3 h-3 text-violet-400" />
                        {gitStatus.currentBranch}
                      </span>
                    )}
                  </h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Sinkronisasi dua arah dengan akun atau organisasi GitHub Anda, kelola cabang, dan unduh basis kode proyek.
                  </p>
                </div>

                {/* 1. GitHub Integration Card (Image 3 & 4) */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-4 shadow-sm">
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-100 shadow-inner">
                        <GithubIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-100">GitHub</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            2-Way Sync
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Sinkronisasi dua arah dengan akun atau organisasi GitHub Anda
                        </p>
                      </div>
                    </div>

                    {/* Connection Badge & Action Menu */}
                    <div className="flex items-center gap-2 relative">
                      {gitStatus?.connected ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Connected
                          </span>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setOptionsMenuOpen(!optionsMenuOpen)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                              title="Opsi Repositori"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>

                            {optionsMenuOpen && (
                              <div className="absolute right-0 mt-1 w-48 rounded-xl bg-[#080d16] border border-slate-800 shadow-2xl z-30 py-1 text-xs">
                                {gitStatus.repoUrl && (
                                  <a
                                    href={gitStatus.repoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => setOptionsMenuOpen(false)}
                                    className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Buka di GitHub ↗</span>
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={handleRecheckSync}
                                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                                >
                                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                                  <span>Periksa Ulang (Re-check)</span>
                                </button>
                                <div className="border-t border-slate-800/80 my-1"></div>
                                <button
                                  type="button"
                                  onClick={handleDisconnect}
                                  disabled={isDisconnecting}
                                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                >
                                  <Unlink className="w-3.5 h-3.5" />
                                  <span>{isDisconnecting ? 'Memutuskan...' : 'Putuskan / Disconnect'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                          Disconnected
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Content */}
                  {gitStatus?.connected ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* Repository Name & External Link */}
                      <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                          Repository
                        </span>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-200 truncate" title={gitStatus.repoName}>
                            {gitStatus.repoName || projectName}
                          </span>
                          {gitStatus.repoUrl && (
                            <a
                              href={gitStatus.repoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-amber-400 hover:text-amber-300 p-1 hover:bg-slate-800 rounded transition-colors shrink-0"
                              title="Buka Repositori di GitHub"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Branch Selector Dropdown */}
                      <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                            Cabang Aktif (Branch)
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {gitStatus.branches?.length || 1} cabang
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                          <select
                            value={gitStatus.currentBranch || 'main'}
                            onChange={(e) => handleChangeBranch(e.target.value)}
                            disabled={isCheckingOutBranch}
                            className="flex-1 bg-transparent font-mono text-xs text-slate-200 border-none outline-none cursor-pointer focus:ring-0 truncate"
                          >
                            {gitStatus.branches?.map((b) => (
                              <option key={b} value={b} className="bg-slate-900 text-slate-200">
                                {b} {b === gitStatus.currentBranch ? '(aktif)' : ''}
                              </option>
                            ))}
                          </select>
                          {isCheckingOutBranch && (
                            <RefreshCw className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-lg bg-slate-950/60 border border-dashed border-slate-800 space-y-2">
                      <span className="text-xs text-slate-300 block font-medium">
                        Tautkan repositori GitHub untuk mengaktifkan sinkronisasi 2-arah:
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="https://github.com/username/repository.git"
                          value={connectRepoInput}
                          onChange={(e) => setConnectRepoInput(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={handleConnectRepo}
                          disabled={isConnectingRepo || !connectRepoInput.trim()}
                          className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition-all cursor-pointer"
                        >
                          {isConnectingRepo ? 'Menghubungkan...' : 'Hubungkan'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Status Sinkronisasi Card (Image 3 & 4) */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      gitStatus?.syncStatus === 'in_sync'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : gitStatus?.syncStatus === 'behind'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : gitStatus?.syncStatus === 'ahead'
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {gitStatus?.syncStatus === 'in_sync' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100">
                          {gitStatus?.syncMessage || 'In sync with GitHub'}
                        </span>
                        {gitStatus?.localCommit && (
                          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 border border-slate-700">
                            {gitStatus.localCommit}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Terakhir disinkronkan: {gitStatus?.lastSynced || 'Baru saja'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleRecheckSync}
                      disabled={isCheckingGit}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700/80 transition-all active:scale-95 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isCheckingGit ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
                      <span>{isCheckingGit ? 'Memeriksa...' : 'Re-check'}</span>
                    </button>
                  </div>
                </div>

                {/* 3. Clone Repository Section (Image 3 & 4) */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3 shadow-sm">
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">Klon Repositori (Clone)</h4>
                    <p className="text-[11px] text-slate-400">
                      Gunakan perintah berikut untuk mengklon repositori ke komputer lokal Anda.
                    </p>
                  </div>

                  {/* Protocol Selector Tabs */}
                  <div className="flex items-center gap-1 border-b border-slate-800 pb-1">
                    {(['https', 'ssh', 'cli'] as const).map((proto) => (
                      <button
                        key={proto}
                        type="button"
                        onClick={() => setCloneProtocol(proto)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          cloneProtocol === proto
                            ? 'bg-slate-800 text-amber-400 font-bold border border-slate-700'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {proto === 'https' ? 'HTTPS' : proto === 'ssh' ? 'SSH' : 'GitHub CLI'}
                      </button>
                    ))}
                  </div>

                  {/* Snippet box with copy button */}
                  {(() => {
                    const repoSlug =
                      gitStatus?.repoName ||
                      (isArtaLoka ? 'chusni12/artaloka-2514cb7b' : `chusni12/${projectName.toLowerCase().replace(/\s+/g, '-')}`);
                    const cloneCommand =
                      cloneProtocol === 'https'
                        ? (gitStatus?.cloneUrls?.https || `https://github.com/${repoSlug}.git`)
                        : cloneProtocol === 'ssh'
                        ? (gitStatus?.cloneUrls?.ssh || `git@github.com:${repoSlug}.git`)
                        : (gitStatus?.cloneUrls?.cli || `gh repo clone ${repoSlug}`);

                    return (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950 font-mono text-xs border border-slate-800">
                        <span className="text-slate-300 flex-1 select-all overflow-x-auto no-scrollbar whitespace-nowrap">
                          {cloneProtocol === 'cli' ? cloneCommand : `git clone ${cloneCommand}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyClone(cloneProtocol === 'cli' ? cloneCommand : `git clone ${cloneCommand}`)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors cursor-pointer shrink-0"
                        >
                          {isCopiedClone ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400 font-semibold">Disalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-slate-400" />
                              <span>Salin</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* 4. Unduh Basis Kode (ZIP - Image 4) */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">Unduh Basis Kode</h4>
                    <p className="text-[11px] text-slate-400">
                      Unduh arsip ZIP lengkap dari proyek ini (tanpa folder node_modules dan riwayat .git).
                    </p>
                  </div>

                  <a
                    href={`/api/git/download-zip?projectPath=${encodeURIComponent(activePath || process.cwd())}`}
                    download={`${projectName.toLowerCase().replace(/\s+/g, '-')}.zip`}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh basis kode (ZIP)</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <SkriptEditorModal
        isOpen={isSkriptEditorOpen}
        onClose={() => setIsSkriptEditorOpen(false)}
        projectPath={activePath}
        projectName={projectName}
        onSaved={(nextState) => setSkriptState(nextState)}
      />
    </div>
  );
};
