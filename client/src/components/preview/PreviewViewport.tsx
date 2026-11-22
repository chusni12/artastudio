import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Smartphone,
  Tablet,
  Monitor,
  RotateCw,
  ExternalLink,
  Code,
  Eye,
  AlertTriangle,
  Loader2,
  ChevronDown,
  Globe,
  FileCode,
  Check,
  Copy,
  X,
  Sparkles,
} from 'lucide-react';
import {
  ViewportMode,
  DeviceType,
  DeviceConfig,
  PreviewRoute,
  PreviewError,
  PreviewViewportProps,
} from './types';

// Device definitions according to ArtaStudio specification
const DEVICE_CONFIGS: Record<DeviceType, DeviceConfig> = {
  mobile: {
    type: 'mobile',
    name: 'Mobile',
    width: 390,
    height: 844,
    aspectRatio: '390/844',
    label: 'Mobile (390px)',
  },
  tablet: {
    type: 'tablet',
    name: 'Tablet',
    width: 768,
    height: 1024,
    aspectRatio: '768/1024',
    label: 'Tablet (768px)',
  },
  desktop: {
    type: 'desktop',
    name: 'Desktop',
    width: '100%',
    height: '100%',
    label: 'Desktop (100% full width)',
  },
};

// Default ArtaStudio route presets
const DEFAULT_PREVIEW_ROUTES: PreviewRoute[] = [
  { label: 'Halaman Utama', path: '/', description: 'Beranda aplikasi ArtaStudio' },
  { label: 'Marketplace', path: '/marketplace', description: 'Katalog karya dan aset kreatif' },
  { label: 'Profil Seniman', path: '/profile', description: 'Halaman profil dan portofolio' },
  { label: 'Studio Paint', path: '/studiopaint', description: 'Kanvas digital dan editor gambar' },
  { label: 'Galeri Pameran', path: '/galeri', description: 'Ruang kurasi dan pameran interaktif' },
  { label: 'Komisi Custom', path: '/commissions', description: 'Layanan permintaan karya kustom' },
  { label: 'Riwayat Transaksi', path: '/payments', description: 'Catatan finansial dan kuas' },
  { label: 'Ruang Seniman', path: '/ruang-seniman', description: 'Dashboard kreator mandiri' },
];

export const PreviewViewport: React.FC<PreviewViewportProps> = ({
  baseUrl,
  initialPath = '/',
  routes = DEFAULT_PREVIEW_ROUTES,
  viewMode: controlledMode,
  onViewModeChange,
  device: controlledDevice,
  onDeviceChange,
  onError,
  onNavigate,
  className = '',
  children,
}) => {
  // Mode state: 'preview' (Pratinjau) vs 'code' (Kode / Editor)
  const [internalMode, setInternalMode] = useState<ViewportMode>('preview');
  const currentMode = controlledMode ?? internalMode;

  const handleModeChange = useCallback(
    (newMode: ViewportMode) => {
      setInternalMode(newMode);
      onViewModeChange?.(newMode);
    },
    [onViewModeChange]
  );

  // Device size state: 'mobile' (390px) | 'tablet' (768px) | 'desktop' (100%)
  const [internalDevice, setInternalDevice] = useState<DeviceType>('desktop');
  const currentDevice = controlledDevice ?? internalDevice;

  const handleDeviceChange = useCallback(
    (newDevice: DeviceType) => {
      setInternalDevice(newDevice);
      onDeviceChange?.(newDevice);
    },
    [onDeviceChange]
  );

  // Path & Navigation state
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [customPathInput, setCustomPathInput] = useState<string>(initialPath);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [isEditingUrl, setIsEditingUrl] = useState<boolean>(false);

  // Iframe lifecycle & loading state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Error sensor state
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const [showErrorDrawer, setShowErrorDrawer] = useState<boolean>(false);
  const [copiedErrorId, setCopiedErrorId] = useState<string | null>(null);

  // Resolve base preview host
  const resolvedBaseUrl =
    baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173');

  const currentFullUrl = `${resolvedBaseUrl.replace(/\/$/, '')}${
    currentPath.startsWith('/') ? currentPath : '/' + currentPath
  }`;

  // Handle path selection or custom entry
  const navigateTo = useCallback(
    (newPath: string) => {
      const sanitized = newPath.trim().startsWith('/') ? newPath.trim() : `/${newPath.trim()}`;
      setCurrentPath(sanitized);
      setCustomPathInput(sanitized);
      setIsDropdownOpen(false);
      setIsEditingUrl(false);
      setIsLoading(true);
      onNavigate?.(sanitized);
    },
    [onNavigate]
  );

  // Handle manual reload
  const handleReload = useCallback(() => {
    setIsLoading(true);
    setReloadKey((prev) => prev + 1);
  }, []);

  // Handle Open in New Tab
  const handleOpenExternal = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.open(currentFullUrl, '_blank', 'noopener,noreferrer');
    }
  }, [currentFullUrl]);

  // PostMessage listener to capture errors from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      const data = event.data;
      let detectedError: PreviewError | null = null;

      // 1. Direct ArtaStudio error protocol
      if (data.type === 'STUDIO_ERROR' || data.type === 'PREVIEW_ERROR') {
        const payload = data.payload || data;
        detectedError = {
          id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          message: payload.message || 'Error tidak terduga pada pratinjau ArtaStudio',
          source: payload.source || payload.filename,
          lineno: payload.lineno || payload.line,
          colno: payload.colno || payload.column,
          stack: payload.stack,
          timestamp: payload.timestamp || Date.now(),
        };
      }
      // 2. Vite / Webpack build or runtime overlay error
      else if (data.type === 'vite:error' || data.type === 'webpack_error') {
        const err = data.err || data.error || {};
        detectedError = {
          id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          message: err.message || data.message || 'Build Compilation Error',
          source: err.id || err.loc?.file,
          lineno: err.loc?.line,
          colno: err.loc?.column,
          stack: err.frame || err.stack,
          timestamp: Date.now(),
        };
      }
      // 3. Uncaught window error or unhandled rejection captured inside iframe
      else if (data.type === 'CONSOLE_ERROR' || data.type === 'UNCAUGHT_ERROR') {
        detectedError = {
          id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          message: typeof data.message === 'string' ? data.message : JSON.stringify(data.message),
          source: data.filename || data.source,
          lineno: data.lineno,
          colno: data.colno,
          stack: data.stack,
          timestamp: Date.now(),
        };
      }
      // 4. In-frame navigation event sync
      else if (data.type === 'STUDIO_NAVIGATE' || data.type === 'STUDIO_ROUTE_CHANGE') {
        if (typeof data.path === 'string' && data.path !== currentPath) {
          setCurrentPath(data.path);
          setCustomPathInput(data.path);
          onNavigate?.(data.path);
        }
      }

      if (detectedError) {
        setErrors((prev) => [detectedError!, ...prev].slice(0, 50));
        onError?.(detectedError);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [currentPath, onError, onNavigate]);

  // Inject error sensor script to iframe on load if accessible (same-origin policy allowing)
  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);

    try {
      const iframe = iframeRef.current;
      if (iframe && iframe.contentDocument) {
        const doc = iframe.contentDocument;
        const scriptId = '__artastudio_preview_error_sensor__';

        if (!doc.getElementById(scriptId)) {
          const script = doc.createElement('script');
          script.id = scriptId;
          script.textContent = `
            (function() {
              window.addEventListener('error', function(event) {
                try {
                  window.parent.postMessage({
                    type: 'STUDIO_ERROR',
                    payload: {
                      message: event.message || 'Runtime Error',
                      source: event.filename,
                      lineno: event.lineno,
                      colno: event.colno,
                      stack: event.error ? event.error.stack : null,
                      timestamp: Date.now()
                    }
                  }, '*');
                } catch(e) {}
              });

              window.addEventListener('unhandledrejection', function(event) {
                try {
                  window.parent.postMessage({
                    type: 'STUDIO_ERROR',
                    payload: {
                      message: 'Unhandled Promise Rejection: ' + (event.reason ? (event.reason.message || String(event.reason)) : 'Unknown reason'),
                      stack: event.reason && event.reason.stack ? event.reason.stack : null,
                      timestamp: Date.now()
                    }
                  }, '*');
                } catch(e) {}
              });
            })();
          `;
          doc.head.appendChild(script);
        }
      }
    } catch {
      // In cross-origin scenarios, direct DOM injection is restricted by browser security;
      // postMessage listener on the window remains active for cross-origin broadcasts.
    }
  }, []);

  // Copy error message utility
  const handleCopyError = (err: PreviewError) => {
    const errorDetails = `[ArtaStudio Sensor Error]\nPesan: ${err.message}\nBerkas: ${err.source || 'N/A'}:${err.lineno || '0'}:${err.colno || '0'}\nWaktu: ${new Date(err.timestamp).toLocaleTimeString()}\nStack:\n${err.stack || 'No stack trace'}`;
    navigator.clipboard.writeText(errorDetails).then(() => {
      setCopiedErrorId(err.id);
      setTimeout(() => setCopiedErrorId(null), 2000);
    });
  };

  const activeDeviceConfig = DEVICE_CONFIGS[currentDevice];

  return (
    <div
      className={`flex flex-col h-full w-full bg-zinc-950 text-zinc-100 select-none overflow-hidden ${className}`}
      data-testid="studio-preview-viewport"
    >
      {/* ========================================================= */}
      {/* 1. TOOLBAR ATAS                                           */}
      {/* ========================================================= */}
      <header className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-xs gap-2 z-30 shrink-0">
        {/* Left Toolbar: View Mode & Responsive Size Controllers */}
        <div className="flex items-center gap-3">
          {/* View Mode Segmented Control: [Pratinjau] & [Kode / Editor] */}
          <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 shadow-inner">
            <button
              type="button"
              onClick={() => handleModeChange('preview')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
                currentMode === 'preview'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
              title="Tampilkan Pratinjau Interaktif"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Pratinjau</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('code')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
                currentMode === 'code'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
              title="Beralih ke Kode / Editor"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Kode / Editor</span>
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          {/* Responsive Device Controls: Mobile (390px) | Tablet (768px) | Desktop (100%) */}
          <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
            {/* Mobile (390px) */}
            <button
              type="button"
              onClick={() => handleDeviceChange('mobile')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                currentDevice === 'mobile'
                  ? 'bg-zinc-800 text-indigo-400 font-semibold shadow-sm ring-1 ring-indigo-500/30'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
              title="Tampilan Mobile (390px)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">390px</span>
            </button>

            {/* Tablet (768px) */}
            <button
              type="button"
              onClick={() => handleDeviceChange('tablet')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                currentDevice === 'tablet'
                  ? 'bg-zinc-800 text-indigo-400 font-semibold shadow-sm ring-1 ring-indigo-500/30'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
              title="Tampilan Tablet (768px)"
            >
              <Tablet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">768px</span>
            </button>

            {/* Desktop (100% full width) */}
            <button
              type="button"
              onClick={() => handleDeviceChange('desktop')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                currentDevice === 'desktop'
                  ? 'bg-zinc-800 text-indigo-400 font-semibold shadow-sm ring-1 ring-indigo-500/30'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
              title="Tampilan Desktop (100% Full Width)"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">100%</span>
            </button>
          </div>
        </div>

        {/* Center Toolbar: Dropdown Navigasi Halaman & URL Input */}
        <div className="relative flex-1 max-w-md mx-2">
          <div className="flex items-center w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus-within:border-indigo-500/70 rounded-md px-2 py-1 transition-all">
            <Globe className="w-3.5 h-3.5 text-zinc-500 shrink-0 mr-1.5" />

            {isEditingUrl ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  navigateTo(customPathInput);
                }}
                className="flex-1 flex items-center"
              >
                <input
                  type="text"
                  value={customPathInput}
                  onChange={(e) => setCustomPathInput(e.target.value)}
                  onBlur={() => {
                    setIsEditingUrl(false);
                    navigateTo(customPathInput);
                  }}
                  autoFocus
                  placeholder="/halaman..."
                  className="w-full bg-transparent text-zinc-200 text-xs outline-none font-mono"
                />
              </form>
            ) : (
              <div
                onClick={() => setIsEditingUrl(true)}
                className="flex-1 font-mono text-zinc-300 text-xs truncate cursor-text hover:text-white"
                title="Klik untuk mengubah URL halaman"
              >
                <span className="text-zinc-500">{resolvedBaseUrl}</span>
                <span className="text-indigo-400 font-medium">{currentPath}</span>
              </div>
            )}

            {/* Dropdown Toggle Button */}
            <button
              type="button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 shrink-0 ml-1"
              title="Daftar Rute Halaman ArtaStudio"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isDropdownOpen ? 'rotate-180 text-indigo-400' : ''
                }`}
              />
            </button>
          </div>

          {/* Dropdown Menu Daftar Halaman */}
          {isDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsDropdownOpen(false)}
              />
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-2xl py-1.5 z-50 max-h-72 overflow-y-auto backdrop-blur-md">
                <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                  Rute Halaman ArtaStudio
                </div>
                {routes.map((route) => {
                  const isActive = currentPath === route.path;
                  return (
                    <button
                      key={route.path}
                      type="button"
                      onClick={() => navigateTo(route.path)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                          : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex flex-col truncate pr-2">
                        <span>{route.label}</span>
                        {route.description && (
                          <span className="text-[10px] text-zinc-500 truncate">
                            {route.description}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-zinc-400 shrink-0">
                        {route.path}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Right Toolbar: Sensor Error Pill, Reload/Refresh, & Open External */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* PostMessage Error Sensor Pill Badge */}
          {errors.length > 0 && (
            <button
              type="button"
              onClick={() => setShowErrorDrawer((prev) => !prev)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30 transition-all font-semibold"
              title={`${errors.length} error tertangkap dari iframe. Klik untuk detail.`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{errors.length} Error</span>
            </button>
          )}

          {/* Tombol Reload / Refresh Iframe */}
          <button
            type="button"
            onClick={handleReload}
            disabled={isLoading}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-all active:scale-95 disabled:opacity-50"
            title="Muat Ulang Pratinjau (Refresh)"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {/* Tombol Open in New Tab (external-link) */}
          <button
            type="button"
            onClick={handleOpenExternal}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-all active:scale-95"
            title="Buka Pratinjau di Tab Baru"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ========================================================= */}
      {/* 2. MAIN VIEWPORT CANVAS AREA                              */}
      {/* ========================================================= */}
      <main className="relative flex-1 bg-zinc-950 overflow-hidden flex flex-col">
        {currentMode === 'code' ? (
          /* ========================================================= */
          /* KODE / EDITOR MODE VIEW                                   */
          /* ========================================================= */
          <div className="flex-1 w-full h-full overflow-auto bg-zinc-950 flex flex-col">
            {children ? (
              children
            ) : (
              <div className="flex-1 flex flex-col p-6 items-center justify-center text-center">
                <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl">
                  <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
                    <FileCode className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100 mb-1">
                    Mode Editor Kode ArtaStudio
                  </h3>
                  <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                    Menampilkan sumber kode untuk rute:{' '}
                    <code className="text-indigo-300 font-mono bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                      {currentPath}
                    </code>
                    . Slot editor kode terintegrasi dapat dihubungkan di sini.
                  </p>
                  <div className="flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleModeChange('preview')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Kembali ke Pratinjau</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ========================================================= */
          /* PRATINJAU / FRAME VIEWPORT VIEW                           */
          /* ========================================================= */
          <div className="relative flex-1 w-full h-full overflow-auto flex items-center justify-center p-4 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px]">
            {/* Wrapper Frame Viewport dengan lebar/aspect-ratio presisi */}
            <div
              style={{
                width: activeDeviceConfig.width,
                maxWidth: '100%',
                height:
                  currentDevice === 'desktop'
                    ? '100%'
                    : typeof activeDeviceConfig.height === 'number'
                    ? `${activeDeviceConfig.height}px`
                    : activeDeviceConfig.height,
              }}
              className={`relative transition-all duration-300 ease-in-out flex flex-col ${
                currentDevice === 'mobile'
                  ? 'max-h-[calc(100vh-130px)] rounded-[36px] border-[8px] border-zinc-800 shadow-2xl shadow-black/80 ring-1 ring-zinc-700/50 bg-zinc-950'
                  : currentDevice === 'tablet'
                  ? 'max-h-[calc(100vh-130px)] rounded-[24px] border-[10px] border-zinc-800 shadow-2xl shadow-black/80 ring-1 ring-zinc-700/50 bg-zinc-950'
                  : 'w-full h-full rounded-none border-0 shadow-none'
              }`}
            >
              {/* Bezel Aksesoris: Mobile Dynamic Island / Notch */}
              {currentDevice === 'mobile' && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-4 bg-zinc-900 rounded-full z-20 pointer-events-none flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-950 ring-1 ring-zinc-800/80 mr-3" />
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-950" />
                </div>
              )}

              {/* Bezel Aksesoris: Tablet Front Camera */}
              {currentDevice === 'tablet' && (
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-zinc-900 z-20 pointer-events-none ring-1 ring-zinc-800" />
              )}

              {/* Container Iframe & Loading Indicator */}
              <div
                className={`relative flex-1 w-full h-full overflow-hidden ${
                  currentDevice === 'mobile'
                    ? 'rounded-[26px]'
                    : currentDevice === 'tablet'
                    ? 'rounded-[14px]'
                    : 'rounded-none'
                }`}
              >
                {/* Indikator Loading Spinner saat me-reload */}
                {isLoading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/85 backdrop-blur-sm transition-opacity duration-200">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
                    <span className="text-xs font-medium text-zinc-200 tracking-wide">
                      Memuat Pratinjau ArtaStudio...
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 mt-1 max-w-xs truncate">
                      {currentFullUrl}
                    </span>
                  </div>
                )}

                {/* Iframe Viewport */}
                <iframe
                  ref={iframeRef}
                  key={`preview-frame-${reloadKey}-${currentPath}`}
                  src={currentFullUrl}
                  onLoad={handleIframeLoad}
                  title="ArtaStudio Preview Viewport"
                  className="w-full h-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
              </div>

              {/* Bezel Aksesoris: Mobile Home Indicator */}
              {currentDevice === 'mobile' && (
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 bg-zinc-600/70 rounded-full z-20 pointer-events-none" />
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* 3. ERROR SENSOR DRAWER / BANNER                           */}
        {/* ========================================================= */}
        {showErrorDrawer && errors.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-30 bg-zinc-900/95 border-t border-rose-500/40 shadow-2xl backdrop-blur-md max-h-72 flex flex-col transition-all">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-rose-950/30">
              <div className="flex items-center gap-2 text-rose-400 font-medium text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Sensor Error ArtaStudio: {errors.length} masalah terdeteksi dari iframe
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setErrors([])}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors"
                >
                  Bersihkan
                </button>
                <button
                  type="button"
                  onClick={() => setShowErrorDrawer(false)}
                  className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800"
                  title="Tutup Panel Error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-3 space-y-2 flex-1">
              {errors.map((err) => (
                <div
                  key={err.id}
                  className="bg-zinc-950/80 border border-rose-900/40 rounded-lg p-2.5 text-xs font-mono space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-rose-300 font-semibold break-all">
                      {err.message}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyError(err)}
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 shrink-0 bg-zinc-800 px-1.5 py-0.5 rounded transition-colors"
                    >
                      {copiedErrorId === err.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                  </div>

                  {(err.source || err.lineno) && (
                    <div className="text-[11px] text-zinc-500 truncate">
                      {err.source}
                      {err.lineno ? `:${err.lineno}` : ''}
                      {err.colno ? `:${err.colno}` : ''}
                    </div>
                  )}

                  {err.stack && (
                    <details className="text-[10px] text-zinc-500 pt-1">
                      <summary className="cursor-pointer hover:text-zinc-400 select-none">
                        Lihat Stack Trace
                      </summary>
                      <pre className="mt-1 p-2 bg-zinc-900/90 rounded border border-zinc-800 whitespace-pre-wrap overflow-x-auto text-zinc-400">
                        {err.stack}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PreviewViewport;
