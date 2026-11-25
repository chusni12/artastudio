import React, { useState } from 'react';
import type { SecurityAuditReport, SecurityPillarResult, SecurityFinding } from '../../../shared/types';

interface SecurityCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: SecurityAuditReport | null;
  isLoading: boolean;
  onConfirmDeploy: () => void;
  isDeploying: boolean;
  onSendToChat?: (prompt: string) => void;
  onRefresh?: () => void;
}

export const SecurityCheckModal: React.FC<SecurityCheckModalProps> = ({
  isOpen,
  onClose,
  report,
  isLoading,
  onConfirmDeploy,
  isDeploying,
  onSendToChat,
  onRefresh,
}) => {
  const [selectedPillarId, setSelectedPillarId] = useState<string>('all');
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null);

  if (!isOpen) return null;

  // Flatten all findings or filter by selected pillar
  const allFindings: SecurityFinding[] = report
    ? report.pillars.flatMap((p) => p.findings)
    : [];

  const displayedFindings =
    selectedPillarId === 'all'
      ? allFindings
      : allFindings.filter((f) => f.category === selectedPillarId);

  // Active finding to display in detail inspector panel
  const activeFinding = selectedFinding || displayedFindings[0] || null;

  const handleAutoFix = (finding: SecurityFinding) => {
    if (!onSendToChat) return;
    const prompt = `[SISTEM AUTO-FIX KEAMANAN]:\nTemuan Keamanan: "${finding.title}"\nKategori: ${finding.category} (Severity: ${finding.level.toUpperCase()})\nDetail Masalah: ${finding.detail}\n${finding.file ? `Lokasi Berkas: ${finding.file}` : ''}\n${finding.remediation ? `Rekomendasi Solusi: ${finding.remediation}` : ''}\n\nTolong lakukan perbaikan kode dan tambal celah keamanan ini sekarang.`;
    onSendToChat(prompt);
    onClose();
  };

  const handleFixAll = () => {
    if (!onSendToChat || !report) return;
    const criticalAndWarnings = allFindings.filter(
      (f) => f.level === 'critical' || f.level === 'warning'
    );
    if (criticalAndWarnings.length === 0) return;

    const issuesSummary = criticalAndWarnings
      .map(
        (f, idx) =>
          `${idx + 1}. [${f.level.toUpperCase()}] ${f.title} (${f.file || f.category}): ${f.detail}`
      )
      .join('\n');

    const prompt = `[SISTEM AUTO-FIX SEMUA TEMUAN]:\nDitemukan ${criticalAndWarnings.length} temuan keamanan & dependensi sebelum deploy:\n${issuesSummary}\n\nTolong periksa setiap temuan di atas dan perbaiki berkas/konfigurasi terkait agar aman dipublikasikan.`;
    onSendToChat(prompt);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in">
      <div className="bg-[#0b101b] border border-slate-800 rounded-2xl max-w-5xl w-full shadow-2xl overflow-hidden flex flex-col h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100">Pemeriksaan Keamanan & Pre-Flight Check</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  Edge Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Inspeksi otomatis RLS database, API keys, dependensi CVE, dan integritas build</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                title="Pindai ulang langsung dari disk tanpa cache"
              >
                <span className={isLoading ? 'animate-spin inline-block' : ''}>↻</span>
                <span>{isLoading ? 'Memindai...' : 'Periksa Ulang'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Top Summary Banner */}
        {report && (
          <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-3.5 h-3.5 rounded-full ${
                  report.overallStatus === 'passed'
                    ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]'
                    : report.overallStatus === 'warning'
                    ? 'bg-amber-400 shadow-[0_0_10px_#fbbf24]'
                    : 'bg-red-400 shadow-[0_0_10px_#f87171] animate-pulse'
                }`}
              />
              <div>
                <span className="font-bold text-xs text-slate-200 mr-2">
                  {report.overallStatus === 'passed'
                    ? 'Semua Pemeriksaan Keamanan Lolos'
                    : report.overallStatus === 'warning'
                    ? 'Pemeriksaan Lolos dengan Catatan'
                    : 'Ditemukan Temuan Kritis yang Perlu Diperbaiki'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {report.summary.passedChecks} Lolos · {report.summary.warnings} Peringatan · {report.summary.criticals} Kritis
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleFixAll}
                className="text-xs px-3 py-1 rounded-md font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow flex items-center gap-1.5"
                title="Sajikan seluruh temuan otomatis ke Chat AI untuk langsung diperbaiki"
              >
                <span>✨ Perbaiki Semua</span>
                <span className="text-[9px] bg-indigo-800 px-1 py-0.2 rounded font-normal">Gratis</span>
              </button>
              <div className="text-right border-l border-slate-800 pl-3">
                <span className="text-lg font-bold font-mono text-amber-400">{report.overallScore}</span>
                <span className="text-xs text-slate-500 font-mono">/100</span>
              </div>
            </div>
          </div>
        )}

        {/* Split Master-Detail Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Findings List & Pillar Tabs */}
          <div className="w-1/2 border-r border-slate-800/80 flex flex-col bg-[#080d16]">
            {/* Filter Tabs */}
            <div className="p-2 border-b border-slate-800/60 flex items-center gap-1 overflow-x-auto text-[11px]">
              <button
                onClick={() => setSelectedPillarId('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors shrink-0 ${
                  selectedPillarId === 'all'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                Semua ({allFindings.length})
              </button>
              {report?.pillars.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPillarId(p.id)}
                  className={`px-2 py-1 rounded-md transition-colors shrink-0 flex items-center gap-1 ${
                    selectedPillarId === p.id
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <span>{p.status === 'passed' ? '✓' : p.status === 'warning' ? '⚠' : '✕'}</span>
                  <span>{p.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>

            {/* Findings Items */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {isLoading ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-2 text-slate-500">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Memindai sistem keamanan...</span>
                </div>
              ) : displayedFindings.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs italic">
                  Tidak ada temuan pada kategori ini. Semua aman.
                </div>
              ) : (
                displayedFindings.map((finding) => {
                  const isSelected = activeFinding?.id === finding.id;
                  return (
                    <div
                      key={finding.id}
                      onClick={() => setSelectedFinding(finding)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-slate-800/80 border-amber-500/80 shadow-md'
                          : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded font-mono ${
                            finding.level === 'critical'
                              ? 'bg-red-950 text-red-300 border border-red-800/50'
                              : finding.level === 'warning'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                          }`}
                        >
                          {finding.level}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate capitalize font-mono">
                          {finding.category}
                        </span>
                      </div>
                      <h4 className="font-semibold text-slate-200 line-clamp-1">{finding.title}</h4>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                        {finding.detail}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Finding Inspector & Evidence (Persis Lovable Detail) */}
          <div className="w-1/2 flex flex-col bg-[#0c121e] overflow-y-auto p-5 text-xs">
            {activeFinding ? (
              <div className="space-y-4">
                {/* Title & Metadata */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono ${
                        activeFinding.level === 'critical'
                          ? 'bg-red-900/40 text-red-300 border border-red-700/60'
                          : activeFinding.level === 'warning'
                          ? 'bg-amber-900/40 text-amber-300 border border-amber-700/60'
                          : 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/60'
                      }`}
                    >
                      {activeFinding.level}
                    </span>
                    <span className="text-slate-500 font-mono text-[10px]">ID: {activeFinding.id}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 leading-snug">{activeFinding.title}</h3>
                </div>

                {/* Meta details grid */}
                <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-slate-900/70 border border-slate-800/80 text-[11px]">
                  <div>
                    <span className="text-slate-500 block mb-0.5">Tingkat Keparahan</span>
                    <span className="font-semibold text-slate-300 capitalize">{activeFinding.level}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Kategori</span>
                    <span className="font-semibold text-slate-300 capitalize font-mono">{activeFinding.category}</span>
                  </div>
                  {activeFinding.file && (
                    <div className="col-span-2 border-t border-slate-800 pt-1.5 mt-1">
                      <span className="text-slate-500 block mb-0.5">Lokasi Berkas</span>
                      <code className="text-amber-400 font-mono text-[10px] break-all">{activeFinding.file}</code>
                    </div>
                  )}
                </div>

                {/* Detail Description */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Deskripsi Masalah (Evidence)
                  </h4>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 leading-relaxed font-sans text-xs">
                    {activeFinding.detail}
                  </div>
                </div>

                {/* Remediation Guide */}
                {activeFinding.remediation && (
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Rekomendasi Perbaikan
                    </h4>
                    <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-amber-200 leading-relaxed text-xs">
                      {activeFinding.remediation}
                    </div>
                  </div>
                )}

                {/* Action Buttons: Tambahkan ke Obrolan & Perbaiki */}
                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800/80">
                  <button
                    onClick={() => handleAutoFix(activeFinding)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
                    title="Salin deskripsi masalah ini ke kotak prompt Chat AI"
                  >
                    <span>💬 Tambahkan ke obrolan</span>
                  </button>
                  <button
                    onClick={() => handleAutoFix(activeFinding)}
                    className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs hover:from-amber-400 hover:to-amber-500 transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
                  >
                    <span>Perbaiki Otomatis</span>
                    <span className="text-[9px] bg-amber-700/40 px-1 py-0.2 rounded font-normal">Gratis</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 italic text-xs">
                Pilih salah satu temuan di sebelah kiri untuk melihat rincian masalah.
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-slate-800/80 bg-slate-900/90 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs transition-colors"
          >
            Batal
          </button>
          <button
            onClick={onConfirmDeploy}
            disabled={isLoading || isDeploying || (report ? !report.canDeploy : false)}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs hover:from-amber-400 hover:to-amber-500 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2"
          >
            {isDeploying ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Mempublikasikan ke Cloudflare Edge...</span>
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
