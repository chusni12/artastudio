# 🚀 ArtaStudio

> **AI-Powered Independent Web Development Suite & Live Preview Studio**  
> Alternatif mandiri (self-hosted) dari Lovable / Bolt / v0 yang dapat dijalankan secara lokal di Linux, Windows, macOS, maupun Termux Android.

---

## ⚡ Instalasi Cepat & Siap Pakai (1-Langkah)

Cukup jalankan 2 perintah ini di terminal perangkat mana saja:

```bash
git clone https://github.com/chusni12/artastudio.git
cd artastudio
npm install
```

Saat `npm install` selesai, skrip otomatis mem-build seluruh frontend UI client (`postinstall`).

---

## 🖥️ Cara Menjalankan

### Cara 1: Jalankan Langsung
```bash
npm start
```
Atau jika Anda ingin perintah global `artastudio` bisa dipanggil dari folder mana saja:
```bash
npm link
artastudio
```

Buka browser Anda di:
👉 **`http://localhost:4000`**

---

## 🌟 Fitur Utama

1. **Repository & Workspace Selector:**
   - Mengelompokkan proyek berdasarkan Repository Git nyata (`ArtaLoka`, `Tahqiq`, dll) dengan pemilih cabang (*branch switcher*).
2. **Real AI Engine:**
   - Terkoneksi otomatis dengan **OpenCode CLI**, **Agy (Antigravity Multi-Akun)**, atau **Custom API Key** (OpenAI, Gemini, Claude, Groq, Ollama).
3. **Live Responsive Preview & Mobile 3-Slice:**
   - Iframe preview interaktif dengan ukuran Desktop, Tablet (768px), dan Mobile (375px).
   - Di layar HP, antarmuka otomatis berubah menjadi 3-Slice (Proyek ➔ Chat AI ➔ Preview).
4. **Pre-Flight Security Inspector & Auto-Fix:**
   - Audit keamanan otomatis sebelum publish: RLS Supabase, scanning API keys bocor, npm audit CVE, dan integritas build.
   - Dilengkapi tombol **"Perbaiki Otomatis"** dan **"Tambahkan ke Obrolan"** ala cloud modern.
5. **One-Click Deploy ke Cloudflare Edge:**
   - Tombol publikasi instan ke Cloudflare Workers dengan streaming log terminal live.

---

## 📋 Persyaratan Sistem
- **Node.js**: Versi `>= 18.0.0`
- **npm**: Versi `>= 9.0.0`
- **Git**: Terpasang di sistem
