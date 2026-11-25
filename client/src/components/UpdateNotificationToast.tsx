import React, { useEffect, useState, useRef } from 'react';
import {
  Rocket,
  Download,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  GitCommit,
  RefreshCw,
} from 'lucide-react';

export interface UpdateCommitSummary {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  commitsBehind: number;
  localHash?: string;
  remoteHash?: string;
  latestCommit: UpdateCommitSummary | null;
}

type UpdatePhase = 'idle' | 'updating' | 'success' | 'error';
type UpdateStepKey = 'pulling' | 'installing' | 'building' | 'done' | 'error';

interface UpdateProgressPayload {
  step: UpdateStepKey;
  message: string;
  detail?: string;
  progress?: number;
}

interface UpdateNotificationToastProps {
  updateInfo: UpdateInfo | null;
  onDismiss: () => void;
  onUpdateApplied?: () => void;
}

export const UpdateNotificationToast: React.FC<UpdateNotificationToastProps> = ({
  updateInfo,
  onDismiss,
  onUpdateApplied,
}) => {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [currentStep, setCurrentStep] = useState<UpdateStepKey>('pulling');
  const [statusLabel, setStatusLabel] = useState<string>('Menarik update...');
  const [statusDetail, setStatusDetail] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent<UpdateProgressPayload>).detail;
      if (!detail) return;

      if (detail.step === 'error') {
        setPhase('error');
        setCurrentStep('error');
        setErrorMessage(detail.detail || detail.message || 'Gagal memasang pembaruan.');
        return;
      }

      setCurrentStep(detail.step);
      setStatusLabel(detail.message || 'Memproses pembaruan...');
      if (detail.detail) setStatusDetail(detail.detail);
      if (typeof detail.progress === 'number') setProgress(detail.progress);

      if (detail.step === 'done') {
        setPhase('success');
      }
    };

    window.addEventListener('artastudio:system:update_progress', handleProgress);
    return () => {
      window.removeEventListener('artastudio:system:update_progress', handleProgress);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
      }
    };
  }, []);

  if (!updateInfo?.hasUpdate && phase === 'idle') {
    return null;
  }

  const handleApplyUpdate = async () => {
    if (phase === 'updating' || phase === 'success') return;

    setPhase('updating');
    setCurrentStep('pulling');
    setStatusLabel('Menarik update...');
    setStatusDetail('Menarik commit terbaru dari GitHub...');
    setProgress(25);
    setErrorMessage('');

    try {
      const res = await fetch('/api/system/apply-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.message || 'Gagal memasang pembaruan');
      }

      setCurrentStep('done');
      setStatusLabel('Selesai!');
      setStatusDetail('Pembaruan Berhasil Dipasang! Memuat ulang...');
      setProgress(100);
      setPhase('success');
      onUpdateApplied?.();

      reloadTimerRef.current = setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setPhase('error');
      setCurrentStep('error');
      setErrorMessage(err?.message || 'Terjadi kesalahan saat memperbarui ArtaStudio.');
    }
  };

  const isSuccess = phase === 'success';
  const isError = phase === 'error';
  const isUpdating = phase === 'updating';

  const step1Done =
    currentStep === 'installing' || currentStep === 'building' || currentStep === 'done';
  const step2Active = currentStep === 'installing' || currentStep === 'building';
  const step2Done = currentStep === 'done';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-3 right-3 left-3 sm:left-auto sm:top-4 sm:right-4 z-[60] sm:w-[390px] rounded-2xl border backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-top-3 ${
        isSuccess
          ? 'bg-[#0b1312]/95 border-emerald-500/50 shadow-emerald-500/20'
          : isError
          ? 'bg-[#140c10]/95 border-rose-500/50 shadow-rose-500/20'
          : 'bg-[#0b0f17]/95 border-amber-500/40 shadow-amber-500/15'
      }`}
    >
      {/* Top Accent Bar */}
      <div
        className={`h-1 w-full ${
          isSuccess
            ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400'
            : isError
            ? 'bg-gradient-to-r from-rose-500 via-red-500 to-amber-500'
            : 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-600'
        }`}
      />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isSuccess
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.25)]'
                : isError
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.25)]'
            }`}
          >
            {isSuccess ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : isError ? (
              <AlertTriangle className="w-5 h-5" />
            ) : isUpdating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Rocket className="w-5 h-5" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h3
                  className={`text-sm font-bold tracking-tight truncate ${
                    isSuccess
                      ? 'text-emerald-300'
                      : isError
                      ? 'text-rose-300'
                      : 'text-amber-300'
                  }`}
                >
                  {isSuccess
                    ? 'Pembaruan Berhasil Dipasang!'
                    : isError
                    ? 'Pembaruan Gagal'
                    : isUpdating
                    ? 'Memperbarui ArtaStudio...'
                    : 'Pembaruan Tersedia!'}
                </h3>
                {!isSuccess && !isError && (updateInfo?.commitsBehind ?? 0) > 0 && (
                  <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    +{updateInfo?.commitsBehind} commit
                  </span>
                )}
              </div>

              {!isUpdating && !isSuccess && (
                <button
                  type="button"
                  onClick={onDismiss}
                  title="Tutup notifikasi"
                  aria-label="Tutup"
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              {isSuccess
                ? 'Pembaruan Berhasil Dipasang! Memuat ulang...'
                : isError
                ? errorMessage
                : isUpdating
                ? statusDetail || statusLabel
                : 'Versi baru ArtaStudio telah dirilis di GitHub.'}
            </p>
          </div>
        </div>

        {/* Latest Commit Summary (Idle state) */}
        {phase === 'idle' && updateInfo?.latestCommit && (
          <div className="mt-3 rounded-xl bg-slate-900/80 border border-slate-800/90 px-3 py-2 flex items-start gap-2">
            <GitCommit className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-200 line-clamp-2">
                {updateInfo.latestCommit.message}
              </p>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                <span className="font-mono text-amber-300 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800">
                  {updateInfo.latestCommit.shortHash}
                </span>
                <span className="truncate">oleh {updateInfo.latestCommit.author}</span>
              </div>
            </div>
          </div>
        )}

        {/* Streaming Progress Pipeline (Updating / Success) */}
        {(isUpdating || isSuccess) && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className={step1Done ? 'text-emerald-400' : 'text-amber-300'}>
                {step1Done ? '✓' : '●'} Menarik update...
              </span>
              <span className="text-slate-600">➔</span>
              <span
                className={
                  step2Done
                    ? 'text-emerald-400'
                    : step2Active
                    ? 'text-amber-300'
                    : 'text-slate-500'
                }
              >
                {step2Done ? '✓' : step2Active ? '●' : '○'} Meng-compile client...
              </span>
              <span className="text-slate-600">➔</span>
              <span className={isSuccess ? 'text-emerald-400' : 'text-slate-500'}>
                {isSuccess ? '✓ Selesai!' : 'Selesai!'}
              </span>
            </div>

            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isSuccess
                    ? 'bg-emerald-400'
                    : 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500'
                }`}
                style={{ width: `${Math.max(10, progress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {phase === 'idle' && (
          <div className="mt-3.5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyUpdate}
              className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Perbarui Sekarang</span>
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-semibold transition-colors cursor-pointer"
            >
              Nanti
            </button>
          </div>
        )}

        {isUpdating && (
          <div className="mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{statusLabel}</span>
          </div>
        )}

        {isError && (
          <div className="mt-3.5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyUpdate}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Coba Lagi</span>
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-semibold transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
