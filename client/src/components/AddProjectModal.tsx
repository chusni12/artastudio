import React, { useState } from 'react';

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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/workspaces/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          localPath: localPath.trim(),
          gitUrl: gitUrl.trim(),
          folderName: targetFolderName.trim(),
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal menambahkan proyek');
      }

      onProjectAdded();
      onClose();
      setLocalPath('');
      setGitUrl('');
      setTargetFolderName('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
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
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1">
            ✕
          </button>
        </div>

        {/* Tab Mode */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setMode('local');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 ${
                mode === 'local'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📂 Folder Lokal</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('clone');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 ${
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
                  onChange={(e) => setLocalPath(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs"
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
                  onChange={(e) => setGitUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs"
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
                  onChange={(e) => setTargetFolderName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading || (mode === 'local' ? !localPath : !gitUrl)}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-40 flex items-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Memproses...</span>
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
