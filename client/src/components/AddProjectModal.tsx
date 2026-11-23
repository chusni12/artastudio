import React, { useState, useEffect, useRef } from 'react';
import type { GitCloneProgress } from '../../shared/types';

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
  const [mode, setMode] = useState<'local' | 'clone'>('local');
  const [localPath, setLocalPath] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [targetFolderName, setTargetFolderName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cloneProgress, setCloneProgress] = useState<GitCloneProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Tangkap broadcast WebSocket progress jika ada
  useEffect(() => {
    const handleWsProgress = (e: Event) => {
      const data = (e as CustomEvent).detail as GitCloneProgress;
      if (data && isLoading && mode === 'clone') {
        setCloneProgress(data);
      }
    };

    window.addEventListener('artastudio:clone:progress', handleWsProgress);
    return () => {
      window.removeEventListener('artastudio:clone:progress', handleWsProgress);
    };
  }, [isLoading, mode]);

  if (!isOpen) return null;

  const resetForm = () => {
    setLocalPath('');
    setGitUrl('');
    setTargetFolderName('');
    setErrorMsg(null);
    setCloneProgress(null);
    setIsLoading(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleClose = () => {
    if (isLoading && mode === 'clone') {
      if (!confirm('Proses git clone sedang berjalan. Yakin ingin membatalkan?')) {
        return;
      }
    }
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    setCloneProgress(null);

    if (mode === 'local') {
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

    // Mode 'clone' dengan streaming real-time
    try {
      setCloneProgress({
        stage: 'cloning',
        percent: 0,
        text: 'Menghubungkan ke repositori Git...',
      });

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
          gitUrl: gitUrl.trim(),
          folderName: targetFolderName.trim(),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#0c121e] border border-slate-800 rounded-xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col text-xs text-slate-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <span className="text-base">📁</span>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Tambah Proyek Baru</h2>
              <p className="text-[11px] text-slate-400">Pautkan folder lokal atau clone dari repositori Git</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-slate-500 hover:text-slate-300 p-1">
            ✕
          </button>
        </div>

        {/* Tab Mode */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setMode('local');
                setErrorMsg(null);
                setCloneProgress(null);
              }}
              className={`py-2 px-3 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 ${
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
              className={`py-2 px-3 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                mode === 'clone'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🔗 Git Clone URL</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-[11px]">
              ⚠️ {errorMsg}
            </div>
          )}

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
                  placeholder="Nama folder untuk clone (kosongkan untuk default)"
                  value={targetFolderName}
                  disabled={isLoading}
                  onChange={(e) => setTargetFolderName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* Animated Amber/Gold Progress Bar saat mode clone */}
          {isLoading && mode === 'clone' && (
            <div className="space-y-2 p-3.5 bg-gradient-to-br from-amber-500/10 via-amber-950/20 to-slate-900 border border-amber-500/30 rounded-xl shadow-lg">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-amber-300 font-medium truncate max-w-[78%]">
                  <span className="relative flex h-2 w-2 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span className="truncate font-semibold">
                    {cloneProgress?.text || 'Menghubungkan ke repositori...'}
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

          {/* Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading && mode === 'clone' && cloneProgress?.stage !== 'error'}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading || (mode === 'local' ? !localPath : !gitUrl)}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-40 flex items-center gap-2 min-w-[120px] justify-center"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span className="truncate max-w-[200px]">
                    {mode === 'clone'
                      ? (cloneProgress?.text || 'Memproses...')
                      : 'Memproses...'}
                  </span>
                </>
              ) : (
                <span>{mode === 'local' ? 'Tautkan Proyek' : 'Mulai Clone'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
