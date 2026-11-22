import React, { useState, useEffect } from 'react';

interface AIProviderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface AISettingsConfig {
  mode: 'opencode' | 'agy' | 'custom_api';
  hasLocalOpenCode: boolean;
  provider: 'openai' | 'anthropic' | 'gemini' | 'groq' | 'ollama' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const AIProviderSettingsModal: React.FC<AIProviderSettingsProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<AISettingsConfig>({
    mode: 'opencode',
    hasLocalOpenCode: true,
    provider: 'gemini',
    apiKey: '',
    baseUrl: '',
    model: 'gemini-1.5-flash',
  });
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('artastudio_ai_config');
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('artastudio_ai_config', JSON.stringify(config));
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#0c121e] border border-slate-800 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col text-xs text-slate-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Konfigurasi Engine AI</h2>
              <p className="text-[11px] text-slate-400">Pilih OpenCode lokal gratis atau gunakan Custom API Key sendiri</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1">✕</button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Mode Switcher 3 Opsi */}
          <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
            <button
              onClick={() => setConfig({ ...config, mode: 'opencode' })}
              className={`py-2 px-2 rounded-md font-semibold transition-all flex flex-col items-center gap-0.5 ${
                config.mode === 'opencode'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="font-bold">⚡ OpenCode</span>
              <span className="text-[8px] opacity-80">Gratis Lokal</span>
            </button>
            <button
              onClick={() => setConfig({ ...config, mode: 'agy' })}
              className={`py-2 px-2 rounded-md font-semibold transition-all flex flex-col items-center gap-0.5 ${
                config.mode === 'agy'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="font-bold">🚀 Agy CLI</span>
              <span className="text-[8px] opacity-80">Multi-Tiered</span>
            </button>
            <button
              onClick={() => setConfig({ ...config, mode: 'custom_api' })}
              className={`py-2 px-2 rounded-md font-semibold transition-all flex flex-col items-center gap-0.5 ${
                config.mode === 'custom_api'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="font-bold">🔑 Custom API</span>
              <span className="text-[8px] opacity-80">BYO API Key</span>
            </button>
          </div>

          {config.mode === 'opencode' ? (
            <div className="p-3.5 rounded-lg border border-emerald-800/60 bg-emerald-950/20 text-emerald-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-100">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Terdeteksi OpenCode di Sistem</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                ArtaStudio terhubung otomatis ke runtime <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">opencode</code> di komputer Anda. Anda dapat langsung coding, chatting, dan meminta AI mengedit file <strong>tanpa perlu memasukkan API Key</strong> atau membayar token!
              </p>
            </div>
          ) : config.mode === 'agy' ? (
            <div className="p-3.5 rounded-lg border border-amber-800/60 bg-amber-950/20 text-amber-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-100">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Terhubung ke Agy (Antigravity Multi-Akun Tiered)</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                ArtaStudio terhubung langsung ke mesin <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">agy</code> di Linux lokal Anda (<code className="text-slate-400">/home/chusni/.local/bin/agy</code>). Menggunakan kuota multi-akun Gemini Gengs OmniRoute tingkat lanjut dengan kemampuan auto-edit dan auto-approve tool execution!
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Penyedia AI (Provider)</label>
                <select
                  value={config.provider}
                  onChange={(e) => setConfig({ ...config, provider: e.target.value as any })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="gemini">Google Gemini API (Gemini 1.5 Flash / Pro)</option>
                  <option value="openai">OpenAI API (GPT-4o / GPT-4o-mini)</option>
                  <option value="anthropic">Anthropic Claude (Claude 3.5 Sonnet)</option>
                  <option value="groq">Groq Cloud (Llama 3.3 70B Fast)</option>
                  <option value="ollama">Ollama Lokal (Local Host)</option>
                  <option value="custom">Custom OpenAI-Compatible Endpoint</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">API Key Anda</label>
                <input
                  type="password"
                  placeholder="sk-... atau AIzaSy..."
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">API Key hanya tersimpan secara privat di browser lokal Anda.</span>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Nama Model (Opsional)</label>
                <input
                  type="text"
                  placeholder="Misal: gpt-4o, gemini-1.5-flash, llama-3.3-70b"
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800">
            Batal
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md shadow-amber-500/20"
          >
            {isSaved ? 'Tersimpan ✓' : 'Simpan Konfigurasi'}
          </button>
        </div>
      </div>
    </div>
  );
};
