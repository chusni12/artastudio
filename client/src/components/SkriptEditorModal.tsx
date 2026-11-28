import React, { useEffect, useState } from 'react';
import type { SkriptStateResponse } from '../../../shared/types';

interface SkriptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  projectName?: string;
  onSaved?: (state: SkriptStateResponse) => void;
}

export const SkriptEditorModal: React.FC<SkriptEditorModalProps> = ({
  isOpen,
  onClose,
  projectPath,
  projectName,
  onSaved,
}) => {
  const [scope, setScope] = useState<'project' | 'default'>('project');
  const [state, setState] = useState<SkriptStateResponse | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSkriptState = async () => {
    if (!projectPath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/skript?projectPath=${encodeURIComponent(projectPath)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memuat skript.md');
      }
      setState(data);
      setDraft(scope === 'project' ? data.content : data.defaultContent);
      onSaved?.(data);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat skript.md');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSkriptState();
    } else {
      setNotice(null);
      setError(null);
    }
  }, [isOpen, projectPath]);

  const handleScopeChange = (nextScope: 'project' | 'default') => {
    setScope(nextScope);
    setNotice(null);
    setError(null);
    if (state) {
      setDraft(nextScope === 'project' ? state.content : state.defaultContent);
    }
  };

  const handleSave = async () => {
    if (!draft.trim()) {
      setError('Isi skript.md tidak boleh kosong.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/skript', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath,
          content: draft,
          scope,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal menyimpan skript.md');
      }
      setState(data);
      setDraft(scope === 'project' ? data.content : data.defaultContent);
      setNotice(
        scope === 'default'
          ? 'Default global berhasil disimpan & disinkronkan ke seluruh proyek non-custom.'
          : 'skript.md proyek berhasil disimpan.'
      );
      onSaved?.(data);
    } catch (err: any) {
      setError(err?.message || 'Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/skript/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath,
          scope,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mereset skript.md');
      }
      setState(data);
      setDraft(scope === 'project' ? data.content : data.defaultContent);
      setNotice(
        scope === 'default'
          ? 'Default global dikembalikan ke bawaan ArtaStudio.'
          : 'skript.md proyek dikembalikan ke default aktif.'
      );
      onSaved?.(data);
    } catch (err: any) {
      setError(err?.message || 'Gagal mereset skript.md');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-[#0b101b] border border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base">📜</span>
              <h2 className="text-sm font-bold text-slate-100">
                Editor Protokol Orkestrasi (<span className="font-mono text-amber-400">skript.md</span>)
              </h2>
              {projectName && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  {projectName}
                </span>
              )}
              {state && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    state.isCustomized
                      ? 'bg-violet-500/10 text-violet-300 border-violet-500/30'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {state.isCustomized ? 'Custom Proyek' : 'Default ArtaStudio'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Kelola aturan Pemikir &amp; 32 Worker untuk proyek ini atau ubah template default global untuk semua proyek baru.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scope Selector Tabs */}
        <div className="px-4 py-2.5 border-b border-slate-800/80 bg-[#080d16] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleScopeChange('project')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                scope === 'project'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              Proyek Ini (skript.md)
            </button>
            <button
              type="button"
              onClick={() => handleScopeChange('default')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                scope === 'default'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              Default Global ArtaStudio
              {state?.hasCustomGlobalDefault && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.2 rounded bg-black/20">Edited</span>
              )}
            </button>
          </div>

          <span className="text-[11px] text-slate-500 font-mono truncate max-w-xs" title={projectPath}>
            {scope === 'project' ? `${projectPath}/skript.md` : 'Global Default Template'}
          </span>
        </div>

        {/* Editor Area */}
        <div className="flex-1 p-4 flex flex-col gap-2 overflow-hidden bg-[#0a0f19]">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800/70 text-rose-300 text-xs">
              {error}
            </div>
          )}
          {notice && (
            <div className="px-3 py-2 rounded-lg bg-emerald-950/60 border border-emerald-800/70 text-emerald-300 text-xs">
              {notice}
            </div>
          )}

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
              Memuat skript.md...
            </div>
          ) : (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-amber-500 resize-none"
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-slate-800/80 bg-slate-900/80 flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || loading}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {scope === 'default' ? 'Reset ke Bawaan ArtaStudio' : 'Reset ke Default Global'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : scope === 'default' ? 'Simpan sebagai Default Global' : 'Simpan skript.md'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
