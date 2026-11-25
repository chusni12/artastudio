/**
 * ArtaStudio - Tes Persistensi IndexedDB (Modal)
 *
 * UI untuk menjalankan & melihat hasil tes persistensi IndexedDB
 * (tulis & baca-balik, verifikasi nilai, simulasi reload koneksi).
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, X, Database, Loader2 } from 'lucide-react';
import { runPersistenceTest, TEST_DB_NAME, TEST_STORE_NAME } from '../services/indexedDbPersistenceTest';
import type { PersistenceTestReport, PersistenceStep } from '../services/indexedDbPersistenceTest';

interface IndexedDbPersistenceTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IndexedDbPersistenceTestModal: React.FC<IndexedDbPersistenceTestModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [report, setReport] = useState<PersistenceTestReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runTest = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setReport(null);
    try {
      const result = await runPersistenceTest();
      setReport(result);
    } catch (err) {
      setReport({
        success: false,
        startedAt: new Date().toISOString(),
        durationMs: 0,
        steps: [{ name: 'error', ok: false, detail: (err as Error)?.message || String(err) }],
        error: (err as Error)?.message || String(err),
      });
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (isOpen) runTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const steps: PersistenceStep[] = report?.steps || [];
  const overallOk = report ? report.success : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in">
      <div className="bg-[#0b101b] border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">💾</span>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Tes Persistensi IndexedDB
                <span className="text-[10px] text-slate-400 font-mono ml-2">
                  {TEST_DB_NAME} · {TEST_STORE_NAME}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Menguji apakah data yang ditulis ke IndexedDB tetap terbaca setelah koneksi dibuka ulang
                (simulasi reload halaman).
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

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 bg-[#0c121e]">
          {/* Overall status */}
          {report && (
            <div
              className={`flex items-center justify-between p-3.5 rounded-xl border ${
                overallOk
                  ? 'border-emerald-800/50 bg-emerald-950/20'
                  : 'border-red-800/50 bg-red-950/20'
              }`}
            >
              <div className="flex items-center gap-3">
                {overallOk ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                )}
                <div>
                  <span
                    className={`font-bold text-sm ${overallOk ? 'text-emerald-300' : 'text-red-300'}`}
                  >
                    {overallOk ? 'LOLOS — IndexedDB bertahan persisten' : 'GAGAL — Ada langkah yang tidak lolos'}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5 font-mono">
                    {report.storage
                      ? `${report.storage.storeName} · ${report.storage.recordsWritten} record terverifikasi`
                      : report.error || '-'}
                  </span>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-md font-bold text-xs font-mono border ${
                  overallOk
                    ? 'bg-emerald-900/30 text-emerald-300 border-emerald-800/50'
                    : 'bg-red-900/30 text-red-300 border-red-800/50'
                }`}
              >
                {report.durationMs} ms
              </span>
            </div>
          )}

          {/* Langkah tes */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Langkah Tes ({steps.length})
            </span>
            {isRunning && !report && (
              <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Menjalankan tes...</span>
              </div>
            )}
            {steps.map((s) => (
              <div
                key={s.name}
                className={`flex items-start justify-between p-3.5 rounded-xl border text-xs ${
                  s.ok ? 'border-slate-800 bg-slate-900/50' : 'border-red-800/40 bg-red-950/10'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`shrink-0 ${s.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {s.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  </span>
                  <div>
                    <span className="font-semibold text-slate-200">{s.name}</span>
                    {s.detail && (
                      <span className={`block text-[11px] mt-0.5 ${s.ok ? 'text-slate-400' : 'text-red-300'}`}>
                        {s.detail}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-500 shrink-0 pt-1">
                  {s.durationMs !== undefined ? `${s.durationMs} ms` : ''}
                </span>
              </div>
            ))}
            {!isRunning && steps.length === 0 && (
              <p className="text-[11px] text-slate-500 text-center py-2">
                Klik &quot;Jalankan Ulang Tes&quot; untuk memulai.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-800/80 bg-slate-900/30 flex items-center justify-end gap-2">
          <button
            onClick={runTest}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-50 transition-all cursor-pointer"
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {isRunning ? 'Menjalankan...' : 'Jalankan Ulang Tes'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
