# ArtaStudio

> **AI-Powered Independent Web Development Suite & Live Preview Studio**  
> Alternatif mandiri (*self-hosted*) dari Lovable / Bolt / v0 yang dapat dijalankan secara lokal di Linux, Windows, macOS, maupun Termux Android.

---

## Instalasi Cepat & Siap Pakai (1-Langkah)

Cukup jalankan langkah ini di terminal perangkat mana saja:

```bash
git clone https://github.com/chusni12/artastudio.git
cd artastudio
npm install
```

> **Catatan Otomatis:** Saat `npm install` selesai, sistem secara otomatis mengeksekusi lifecycle `postinstall` untuk mem-build seluruh frontend UI client ke `client/dist`. Anda tidak perlu melakukan compile manual lagi!

---

## 🖥️ Cara Menjalankan

### Cara 1: Jalankan Langsung (Local Project)
```bash
npm start
```

### Cara 2: Jadikan Perintah Global di Terminal (Direkomendasikan)
Agar bisa dipanggil dengan satu kata **`artastudio`** dari direktori mana saja:
```bash
npm link
artastudio
```

Buka browser Anda di:
👉 **`http://localhost:4000`**

### Cara Memperbarui ArtaStudio ke Versi Paling Mutakhir (Auto-Updater)
Cukup ketik satu perintah ini di terminal:
```bash
artastudio update
# atau
artastudio latest
```
*Perintah ini otomatis menarik commit terbaru dari GitHub, memasang dependencies baru, dan mem-build ulang frontend UI tanpa perlu langkah manual!*

### Cara Menutup / Menghentikan Server
- Di terminal yang sedang berjalan: Tekan **`Ctrl + C`**
- Atau dari terminal lain: Ketik **`artastudio stop`** (atau `artastudio exit`)

---

## 📱 Panduan Akses Jarak Jauh / Termux Android

### Opsi A: Laptop sebagai Host, HP sebagai Layar Remote (Paling Ringan)
1. Nyalakan ArtaStudio di laptop: `artastudio`
2. Buka Cloudflare Tunnel gratis:
   ```bash
   cloudflared tunnel --url http://localhost:4000
   ```
3. Buka link HTTPS yang diberikan di browser HP Anda. Tampilan otomatis beralih ke **Mode 3-Slice (Proyek ➔ Chat AI ➔ Preview)**.

### Opsi B: Standalone Murni di Termux Android
```bash
pkg update && pkg install nodejs git
git clone https://github.com/chusni12/artastudio.git
cd artastudio
npm install
npm start
```
Buka `http://localhost:4000` di browser Android Anda, buka menu **`⚙️ Lainnya` ➔ `AI Suite & Engine`**, lalu pilih **Custom API Key** (masukkan API Key Gemini / OpenAI gratis Anda).

---

## Fitur Unggulan ArtaStudio

1. **Repository & Workspace Selector:**
   - Mengelompokkan proyek berdasarkan Repository Git nyata (`ArtaLoka`, `Tahqiq`, dll) lengkap dengan URL remote dan pemilih cabang (*branch switcher*).
2. **Real AI Engine Switcher:**
   - Terkoneksi otomatis dengan **OpenCode CLI**, **Agy (Antigravity Multi-Akun Gemini Gengs Tiered)**, atau **Custom API Key** (OpenAI, Gemini, Claude, Groq, Ollama).
3. **Dropdown Navigator Rute Halaman:**
   - Beralih halaman preview secara instan (`/`, `/marketplace`, `/commissions`, `/profile`, `/studiopaint`, `/admin`).
4. **Live Responsive Preview & Mobile 3-Slice:**
   - Iframe preview interaktif dengan ukuran Desktop, Tablet (768px), dan Mobile (375px).
   - Di layar HP, antarmuka otomatis berubah menjadi 3-Slice terpisah yang lega.
5. **Pre-Flight Security Inspector & Auto-Fix:**
   - Audit keamanan otomatis sebelum publish: RLS Supabase, scanning API keys bocor, npm audit CVE, dan integritas build.
   - Dilengkapi tombol **"Perbaiki Otomatis"**, **"Tambahkan ke Obrolan"**, dan **"Perbaiki Semua"**.
6. **Pusat Pengaturan Proyek & Layanan Cloud ("⚙️ Lainnya"):**
   - Menghubungkan Google Analytics (GA4), Cloud Storage (Supabase/R2/Docker), Domain & Edge DNS, SEO & AI search review, serta pengelolaan Secrets.
7. **One-Click Deploy ke Cloudflare Edge:**
   - Tombol publikasi instan ke Cloudflare Workers dengan streaming log terminal live.
8. **Tes Persistensi IndexedDB:**
   - Tool verifikasi apakah data di sesi ini tetap tersimpan di IndexedDB setelah koneksi dibuka ulang (simulasi reload).

---

## 📋 Persyaratan Sistem
- **Node.js**: Versi `>= 18.0.0`
- **npm**: Versi `>= 9.0.0`
- **Git**: Terpasang di sistem
- **OS**: Linux (Ubuntu, Debian, Arch), Windows (WSL / PowerShell), macOS, Termux (Android).
