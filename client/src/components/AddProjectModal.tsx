import React, { useState, useEffect, useRef } from 'react';
import type { GitCloneProgress } from '../../../shared/types';
import {
  Search,
  Lock,
  Globe,
  RefreshCw,
  Download,
  Check,
  CheckSquare,
  Square,
  ExternalLink,
  Folder,
  Sparkles,
} from 'lucide-react';

interface GitHubRepoItem {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  cloneUrl: string;
  htmlUrl: string;
  description: string;
  updatedAt: string;
  pushedAt?: string;
  defaultBranch: string;
  language: string | null;
  stars: number;
  forks: number;
}

interface GitHubUserProfile {
  login: string;
  name: string;
  avatarUrl: string;
}

interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectAdded: () => void;
}

export const AddProjectModal: React.FC<AddProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectAdded,
}) => {
  const [mode, setMode] = useState<'local' | 'clone' | 'github'>('github');
  const [localPath, setLocalPath] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [targetFolderName, setTargetFolderName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cloneProgress, setCloneProgress] = useState<GitCloneProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // GitHub Picker States
  const [githubRepos, setGithubRepos] = useState<GitHubRepoItem[]>([]);
  const [githubUser, setGithubUser] = useState<GitHubUserProfile | null>(null);
  const [isLoadingGithub, setIsLoadingGithub] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubSearch, setGithubSearch] = useState('');
  const [githubFilter, setGithubFilter] = useState<'all' | 'private' | 'public'>('all');
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<number>>(new Set());
  const [customPat, setCustomPat] = useState('');
  const [showPatInput, setShowPatInput] = useState(false);

  // Tangkap broadcast WebSocket progress jika ada
  useEffect(() => {
    const handleWsProgress = (e: Event) => {
      const data = (e as CustomEvent).detail as GitCloneProgress;
      if (data && isLoading && (mode === 'clone' || mode === 'github')) {
        setCloneProgress(data);
      }
    };

    window.addEventListener('artastudio:clone:progress', handleWsProgress);
    return () => {
      window.removeEventListener('artastudio:clone:progress', handleWsProgress);
    };
  }, [isLoading, mode]);

  // Fetch GitHub repos saat modal dibuka pada tab github
  useEffect(() => {
    if (isOpen && mode === 'github' && githubRepos.length === 0 && !isLoadingGithub) {
      fetchGitHubRepos();
    }
  }, [isOpen, mode]);

  const fetchGitHubRepos = async (tokenOverride?: string) => {
    setIsLoadingGithub(true);
    setGithubError(null);
    try {
      const token = tokenOverride || customPat.trim();
      const url = token
        ? `/api/workspaces/github-repos?token=${encodeURIComponent(token)}`
        : '/api/workspaces/github-repos';

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 401 || !data.authenticated) {
          setShowPatInput(true);
        }
        throw new Error(data.error || 'Gagal memuat repositori GitHub');
      }

      setGithubRepos(data.repos || []);
      if (data.user) {
        setGithubUser(data.user);
      }
      setShowPatInput(false);
    } catch (err: any) {
      setGithubError(err.message || 'Gagal mengambil data dari GitHub');
    } finally {
      setIsLoadingGithub(false);
    }
  };

  if (!isOpen) return null;

  const resetForm = () => {
    setLocalPath('');
    setGitUrl('');
    setTargetFolderName('');
    setErrorMsg(null);
    setCloneProgress(null);
    setIsLoading(false);
    setSelectedRepoIds(new Set());
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleClose = () => {
    if (isLoading && (mode === 'clone' || mode === 'github')) {
      if (!confirm('Proses git clone sedang berjalan. Yakin ingin membatalkan?')) {
        return;
      }
    }
    resetForm();
    onClose();
  };

  // Reusable clone executor
  const executeClone = async (url: string, folder: string) => {
    setErrorMsg(null);
    setIsLoading(true);
    setCloneProgress({
      stage: 'cloning',
      percent: 0,
      text: 'Menghubungkan ke repositori Git...',
    });

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await fetch('/api/workspaces/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          mode: 'clone',
          gitUrl: url.trim(),
          folderName: folder.trim().replace(/\s+/g, '-'),
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok && !res.headers.get('content-type')?.includes('text/event-stream')) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Gagal clone repositori (status ${res.status})`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';

          for (const msg of messages) {
            const trimmed = msg.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonText = trimmed.replace(/^data:\s*/, '');
            try {
              const data: GitCloneProgress = JSON.parse(jsonText);
              setCloneProgress(data);

              if (data.stage === 'error') {
                throw new Error(data.error || data.text || 'Gagal clone repositori');
              }

              if (data.stage === 'done') {
                setTimeout(() => {
                  onProjectAdded();
                  resetForm();
                  onClose();
                }, 800);
                return;
              }
            } catch (err: any) {
              if (err.message && !err.message.includes('JSON')) {
                throw err;
              }
            }
          }
        }
      } else {
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Gagal clone repositori');
        }
        setCloneProgress({
          stage: 'done',
          percent: 100,
          text: '100% Selesai!',
        });
        setTimeout(() => {
          onProjectAdded();
          resetForm();
          onClose();
        }, 800);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setErrorMsg(err.message || 'Terjadi kesalahan sistem saat clone');
      setCloneProgress(null);
      setIsLoading(false);
    }
  };

  // 1-Click Import Single Repo from GitHub Picker
  const handleImportSingleRepo = (repo: GitHubRepoItem) => {
    executeClone(repo.cloneUrl, repo.name);
  };

  // Batch import selected repos
  const handleImportBatch = async () => {
    const selected = githubRepos.filter((r) => selectedRepoIds.has(r.id));
    if (selected.length === 0) return;

    for (let i = 0; i < selected.length; i++) {
      const repo = selected[i];
      setCloneProgress({
        stage: 'cloning',
        percent: Math.round((i / selected.length) * 100),
        text: `Mengimpor (${i + 1}/${selected.length}): ${repo.name}...`,
      });
      await executeClone(repo.cloneUrl, repo.name);
    }
  };

  const toggleSelectRepo = (id: number) => {
    setSelectedRepoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const visible = filteredRepos.map((r) => r.id);
    const allSelected = visible.every((id) => selectedRepoIds.has(id));
    setSelectedRepoIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visible.forEach((id) => next.delete(id));
      } else {
        visible.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (mode === 'local') {
      setIsLoading(true);
      try {
        const res = await fetch('/api/workspaces/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'local',
            localPath: localPath.trim(),
          }),
        });

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Gagal menambahkan proyek');
        }

        onProjectAdded();
        resetForm();
        onClose();
      } catch (err: any) {
        setErrorMsg(err.message || 'Terjadi kesalahan sistem');
        setIsLoading(false);
      }
      return;
    }

    if (mode === 'clone') {
      await executeClone(gitUrl, targetFolderName);
    }
  };

  // Filter repos for GitHub Tab
  const filteredRepos = githubRepos.filter((repo) => {
    const q = githubSearch.toLowerCase().trim();
    const matchesSearch =
      !q ||
      repo.name.toLowerCase().includes(q) ||
      repo.fullName.toLowerCase().includes(q) ||
      (repo.description && repo.description.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (githubFilter === 'private') return repo.private;
    if (githubFilter === 'public') return !repo.private;
    return true;
  });

  const countPrivate = githubRepos.filter((r) => r.private).length;
  const countPublic = githubRepos.filter((r) => !r.private).length;

  const formatRelativeTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Hari ini';
      if (diffDays === 1) return 'Kemarin';
      if (diffDays < 30) return `${diffDays} hari lalu`;
      if (diffDays < 365) return `${Math.floor(diffDays / 30)} bulan lalu`;
      return `${Math.floor(diffDays / 365)} tahun lalu`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#0c121e] border border-slate-800 rounded-xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col text-xs text-slate-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <span className="text-base">📁</span>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Tambah Proyek Baru</h2>
              <p className="text-[11px] text-slate-400">
                Pilih repo dari akun GitHub, tautkan folder lokal, atau masukkan Git URL
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer">
            ✕
          </button>
        </div>

        {/* Tab Mode (3 Tabs: GitHub, Folder Lokal, Git Clone URL) */}
        <div className="p-4 pb-0">
          <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setMode('github');
                setErrorMsg(null);
                setCloneProgress(null);
              }}
              className={`py-2 px-2 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 text-[11px] cursor-pointer ${
                mode === 'github'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🐙 Akun GitHub</span>
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setMode('local');
                setErrorMsg(null);
                setCloneProgress(null);
              }}
              className={`py-2 px-2 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 text-[11px] cursor-pointer ${
                mode === 'local'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📂 Folder Lokal</span>
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setMode('clone');
                setErrorMsg(null);
                setCloneProgress(null);
              }}
              className={`py-2 px-2 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 text-[11px] cursor-pointer ${
                mode === 'clone'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🔗 Git URL</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-[11px]">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Tab 1: Akun GitHub (Live Repo Picker & Search) */}
        {mode === 'github' && (
          <div className="p-4 space-y-3">
            {/* User Profile Bar & Refresh */}
            <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800/80 rounded-lg p-2.5">
              <div className="flex items-center gap-2.5">
                {githubUser?.avatarUrl ? (
                  <img
                    src={githubUser.avatarUrl}
                    alt={githubUser.login}
                    className="w-7 h-7 rounded-full border border-amber-500/50"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs">
                    🐙
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-100 text-xs">
                      {githubUser?.name || githubUser?.login || 'Akun GitHub Lokal'}
                    </span>
                    {githubUser?.login && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        @{githubUser.login}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {githubRepos.length} repositori terdeteksi
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fetchGitHubRepos()}
                  disabled={isLoadingGithub || isLoading}
                  title="Segarkan daftar repositori"
                  className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGithub ? 'animate-spin text-amber-400' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowPatInput(!showPatInput)}
                  className="text-[10px] text-amber-400 hover:text-amber-300 underline px-1 cursor-pointer"
                >
                  {showPatInput ? 'Tutup Token' : 'Ubah Token'}
                </button>
              </div>
            </div>

            {/* Optional Personal Access Token Input */}
            {showPatInput && (
              <div className="p-3 rounded-lg bg-slate-950 border border-amber-500/30 space-y-2 animate-in fade-in">
                <label className="block text-[11px] font-semibold text-amber-300">
                  GitHub Personal Access Token (PAT)
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxx atau github_pat_..."
                    value={customPat}
                    onChange={(e) => setCustomPat(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-md p-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => fetchGitHubRepos(customPat)}
                    disabled={!customPat.trim() || isLoadingGithub}
                    className="px-3 py-1 bg-amber-500 text-slate-950 font-bold rounded-md hover:bg-amber-400 text-xs disabled:opacity-40 cursor-pointer"
                  >
                    Hubungkan
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 block">
                  Token otomatis disimpan untuk sesi ini untuk mengakses repositori privat Anda.
                </span>
              </div>
            )}

            {githubError && (
              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-[11px]">
                ⚠️ {githubError}
              </div>
            )}

            {/* Search Bar & Filter Chips */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari repositori GitHub..."
                  value={githubSearch}
                  onChange={(e) => setGithubSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
                {githubSearch && (
                  <button
                    type="button"
                    onClick={() => setGithubSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs p-1"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 shrink-0 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => setGithubFilter('all')}
                  className={`px-2 py-1 rounded font-medium transition-colors cursor-pointer ${
                    githubFilter === 'all'
                      ? 'bg-slate-800 text-amber-400 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Semua ({githubRepos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setGithubFilter('private')}
                  className={`px-2 py-1 rounded font-medium transition-colors cursor-pointer ${
                    githubFilter === 'private'
                      ? 'bg-slate-800 text-amber-400 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🔒 ({countPrivate})
                </button>
                <button
                  type="button"
                  onClick={() => setGithubFilter('public')}
                  className={`px-2 py-1 rounded font-medium transition-colors cursor-pointer ${
                    githubFilter === 'public'
                      ? 'bg-slate-800 text-amber-400 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🌐 ({countPublic})
                </button>
              </div>
            </div>

            {/* Selection actions bar if multiple selected */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <button
                type="button"
                onClick={handleSelectAll}
                className="flex items-center gap-1.5 hover:text-amber-400 transition-colors cursor-pointer"
              >
                {filteredRepos.length > 0 &&
                filteredRepos.every((r) => selectedRepoIds.has(r.id)) ? (
                  <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>Pilih Semua ({filteredRepos.length})</span>
              </button>
              {selectedRepoIds.size > 0 && (
                <span className="text-amber-400 font-medium">
                  {selectedRepoIds.size} dipilih
                </span>
              )}
            </div>

            {/* List of Repositories */}
            <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1 border border-slate-800/80 rounded-lg p-1.5 bg-slate-950/60 no-scrollbar">
              {isLoadingGithub ? (
                <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Mengambil repositori dari GitHub API...</span>
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  Tidak ada repositori yang cocok dengan pencarian
                </div>
              ) : (
                filteredRepos.map((repo) => {
                  const isSelected = selectedRepoIds.has(repo.id);
                  return (
                    <div
                      key={repo.id}
                      className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                          : 'bg-slate-900/70 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {/* Checkbox & Details */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleSelectRepo(repo.id)}
                          className="text-slate-400 hover:text-amber-400 shrink-0 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-100 text-xs truncate max-w-[200px]">
                              {repo.name}
                            </span>
                            {repo.private ? (
                              <span className="inline-flex items-center gap-1 font-mono text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                <Lock className="w-2.5 h-2.5" /> Privat
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-mono text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                <Globe className="w-2.5 h-2.5" /> Publik
                              </span>
                            )}
                            {repo.language && (
                              <span className="font-mono text-[9px] text-slate-400 bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-800">
                                {repo.language}
                              </span>
                            )}
                          </div>

                          {repo.description ? (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {repo.description}
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-600 italic mt-0.5">
                              Tanpa deskripsi
                            </p>
                          )}

                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                            <span>Diperbarui {formatRelativeTime(repo.updatedAt)}</span>
                            <span>•</span>
                            <span className="font-mono">{repo.defaultBranch}</span>
                          </div>
                        </div>
                      </div>

                      {/* 1-Click Import Button */}
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleImportSingleRepo(repo)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-all shadow-sm shadow-amber-500/10 disabled:opacity-40 shrink-0 flex items-center gap-1 cursor-pointer active:scale-95"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>+ Impor Proyek</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Batch Import Bar */}
            {selectedRepoIds.size > 0 && (
              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs text-slate-300">
                  {selectedRepoIds.size} proyek siap diimpor
                </span>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleImportBatch}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-40 flex items-center gap-1.5 text-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Impor {selectedRepoIds.size} Proyek Terpilih</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2 & 3 Forms (Folder Lokal & Git URL) */}
        {mode !== 'github' && (
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            {mode === 'local' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Path Direktori Proyek di Komputer
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: /home/chusni/proyek-baru atau C:\Projects\web"
                    value={localPath}
                    disabled={isLoading}
                    onChange={(e) => setLocalPath(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs disabled:opacity-50"
                    required
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Pastikan folder memiliki berkas package.json atau repositori .git.
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    URL Repositori Git (HTTPS)
                  </label>
                  <input
                    type="text"
                    placeholder="https://github.com/username/repo.git"
                    value={gitUrl}
                    disabled={isLoading}
                    onChange={(e) => setGitUrl(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs disabled:opacity-50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Nama Folder Target (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Nama folder untuk clone (contoh: web-les)"
                    value={targetFolderName}
                    disabled={isLoading}
                    onChange={(e) => setTargetFolderName(e.target.value.replace(/\s+/g, '-'))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs disabled:opacity-50"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Spasi otomatis dinormalisasi menjadi tanda minus (-)
                  </span>
                </div>
              </div>
            )}

            {/* Footer Buttons for Local & Git URL */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isLoading || (mode === 'local' ? !localPath : !gitUrl)}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-40 flex items-center gap-2 min-w-[120px] justify-center cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <span className="truncate max-w-[200px]">
                      {cloneProgress?.text || 'Memproses...'}
                    </span>
                  </>
                ) : (
                  <span>{mode === 'local' ? 'Tautkan Proyek' : 'Mulai Clone'}</span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Animated Amber/Gold Real-time Progress Bar saat cloning berjalan */}
        {isLoading && (
          <div className="m-4 mt-0 space-y-2 p-3.5 bg-gradient-to-br from-amber-500/10 via-amber-950/20 to-slate-900 border border-amber-500/30 rounded-xl shadow-lg">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-amber-300 font-medium truncate max-w-[78%]">
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span className="truncate font-semibold">
                  {cloneProgress?.text || 'Menghubungkan ke repositori Git...'}
                </span>
              </div>
              <span className="font-mono font-bold text-amber-400 text-xs flex-shrink-0 ml-2">
                {cloneProgress?.percent ?? 0}%
              </span>
            </div>

            {/* Progress Bar Container */}
            <div className="w-full bg-slate-950/90 rounded-full h-2.5 overflow-hidden border border-amber-500/25 p-0.5 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(245,158,11,0.6)] relative overflow-hidden"
                style={{
                  width: `${
                    cloneProgress?.stage === 'done'
                      ? 100
                      : Math.min(100, Math.max(cloneProgress?.percent ?? 5, 5))
                  }%`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </div>
            </div>

            {/* Detail footer: speed & size jika tersedia */}
            {(cloneProgress?.speed || cloneProgress?.size) && (
              <div className="flex items-center justify-between text-[10px] text-amber-300/80 pt-0.5 font-mono">
                <span>{cloneProgress?.size ? `Ukuran: ${cloneProgress.size}` : ''}</span>
                <span>{cloneProgress?.speed ? `Kecepatan: ${cloneProgress.speed}` : ''}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
