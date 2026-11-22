import React, { useState } from 'react';
import {
  AlertTriangle,
  Wrench,
  ChevronDown,
  ChevronUp,
  X,
  FileCode,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { SensorErrorItem } from './types';

interface ErrorSensorBannerProps {
  errors: SensorErrorItem[];
  onAutoFix: (error: SensorErrorItem) => void;
  onDismiss?: (errorId?: string) => void;
  className?: string;
}

export const ErrorSensorBanner: React.FC<ErrorSensorBannerProps> = ({
  errors,
  onAutoFix,
  onDismiss,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isFixing, setIsFixing] = useState(false);

  if (!errors || errors.length === 0) return null;

  const currentError = errors[activeIdx] || errors[0];
  const count = errors.length;

  const handleFix = () => {
    setIsFixing(true);
    onAutoFix(currentError);
    setTimeout(() => {
      setIsFixing(false);
    }, 1500);
  };

  return (
    <div
      className={`rounded-xl border border-rose-500/40 bg-gradient-to-r from-rose-950/40 via-slate-900/90 to-amber-950/30 p-3.5 sm:p-4 shadow-xl shadow-rose-950/20 backdrop-blur-md transition-all ${className}`}
    >
      {/* Top Warning Bar */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Animated Glowing Bug Alert Icon */}
          <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.35)] shrink-0 animate-pulse">
            <Flame className="w-4 h-4 text-rose-400" />
          </div>

          <div className="min-w-0">
            {/* Title & Count */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-rose-200 tracking-tight">
                {count === 1 ? '1 Temuan Kritis Terdeteksi' : `${count} Temuan Kritis Terdeteksi`}
              </span>
              <span className="px-2 py-0.5 text-[10px] uppercase font-mono font-bold tracking-wider rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {currentError.type === 'compile'
                  ? 'Kompilasi'
                  : currentError.type === 'runtime'
                  ? 'Runtime'
                  : 'Sensor Bug'}
              </span>
            </div>

            {/* Error Message & Location */}
            <p className="text-xs text-slate-300 mt-1 font-mono leading-relaxed line-clamp-2">
              {currentError.message}
            </p>

            {currentError.file && (
              <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-slate-400">
                <FileCode className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="truncate">
                  {currentError.file}
                  {currentError.line ? `:${currentError.line}` : ''}
                  {currentError.column ? `:${currentError.column}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Dismiss and Collapse controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded transition-colors cursor-pointer"
            title={expanded ? 'Sembunyikan Detail' : 'Lihat Detail Stack'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(currentError.id)}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded transition-colors cursor-pointer"
              title="Tutup Peringatan"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Stack Trace / Technical Details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-rose-900/40 text-xs">
          <div className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center justify-between">
            <span>Log Sensor Diagnostik:</span>
            <span className="text-slate-500 text-[10px] font-mono">{currentError.timestamp}</span>
          </div>
          <pre className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg font-mono text-[11px] text-rose-300/90 overflow-x-auto max-h-36 whitespace-pre leading-relaxed">
            {currentError.stack || currentError.message}
          </pre>

          {count > 1 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-slate-400">Pilih error:</span>
              <div className="flex gap-1">
                {errors.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded cursor-pointer ${
                      activeIdx === i
                        ? 'bg-rose-500/30 text-rose-200 border border-rose-500/50'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    #{i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Bar */}
      <div className="mt-3 pt-2.5 border-t border-rose-900/30 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span>Sensor mendeteksi anomali pada kode sumber proyek.</span>
        </div>

        {/* Perbaiki Otomatis Interactive Button */}
        <button
          type="button"
          onClick={handleFix}
          disabled={isFixing}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.4)] hover:shadow-[0_0_18px_rgba(245,158,11,0.7)] hover:brightness-110 active:scale-95 transition-all cursor-pointer font-sans"
        >
          {isFixing ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 animate-bounce" />
              <span>Memproses Perbaikan...</span>
            </>
          ) : (
            <>
              <Wrench className="w-3.5 h-3.5" />
              <span>Perbaiki Otomatis</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
