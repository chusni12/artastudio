import React from 'react';
import type { SecurityAuditReport, SecurityPillarResult } from '../../shared/types';

interface SecurityCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: SecurityAuditReport | null;
  isLoading: boolean;
  onConfirmDeploy: () => void;
  isDeploying: boolean;
}

export const SecurityCheckModal: React.FC<SecurityCheckModalProps> = ({
  isOpen,
  onClose,
  report,
  isLoading,
  onConfirmDeploy,
  isDeploying,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#0c121e] border border-slate-800 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Pemeriksaan Keamanan & Pre-Flight Check</h2>
              <p className="text-[11px] text-slate-400">Audit integritas RLS, dependensi, dan rahasia sebelum publikasi ke Edge</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 p-1 rounded-md hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 font-mono text-[11px]">Memeriksa basis data, rahasia, dependensi, dan build...</p>
            </div>
          ) : report ? (
            <>
              {/* Score / Overall Banner */}
              <div
                className={`p-3.5 rounded-lg border flex items-center justify-between ${
                  report.overallStatus === 'passed'
                    ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                    : report.overallStatus === 'warning'
                    ? 'bg-amber-950/30 border-amber-800/60 text-amber-300'
                    : 'bg-red-950/30 border-red-800/60 text-red-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      report.overallStatus === 'passed'
                        ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                        : report.overallStatus === 'warning'
                        ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                        : 'bg-red-400 shadow-[0_0_8px_#f87171]'
                    }`}
                  />
                  <div>
                    <div className="font-bold text-slate-100">
                      {report.overallStatus === 'passed'
                        ? 'Semua Pemeriksaan Keamanan Lolos'
                        : report.overallStatus === 'warning'
                        ? 'Pemeriksaan Lolos dengan Catatan'
                        : 'Ditemukan Temuan Kritis yang Perlu Diperbaiki'}
                    </div>
                    <div className="text-[11px] opacity-90 mt-0.5">
                      {report.summary.passedChecks} Lolos · {report.summary.warnings} Peringatan · {report.summary.criticals} Kritis
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold font-mono">{report.overallScore}/100</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Skor Keamanan</div>
                </div>
              </div>

              {/* 4 Pillars Checklist */}
              <div className="space-y-2.5">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pilar Audit Keamanan</h3>
                {report.pillars.map((pillar: SecurityPillarResult) => (
                  <div
                    key={pillar.id}
                    className="p-3 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {pillar.status === 'passed' ? (
                          <span className="text-emerald-400 font-bold text-sm">✓</span>
                        ) : pillar.status === 'warning' ? (
                          <span className="text-amber-400 font-bold text-sm">⚠</span>
                        ) : (
                          <span className="text-red-400 font-bold text-sm">✕</span>
                        )}
                        <span className="font-semibold text-slate-200">{pillar.name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400">{pillar.durationMs}ms</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed pl-5">{pillar.summary}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-slate-500">Gagal memuat laporan audit keamanan.</div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/80 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs transition-colors"
          >
            Batal
          </button>
          <button
            onClick={onConfirmDeploy}
            disabled={isLoading || isDeploying || (report ? !report.canDeploy : false)}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs hover:from-amber-400 hover:to-amber-500 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2"
          >
            {isDeploying ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Mempublikasikan ke Cloudflare...</span>
              </>
            ) : (
              <span>Publikasikan ke Cloudflare Edge ↗</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
