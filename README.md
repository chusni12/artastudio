# ArtaStudio

> **AI-Powered Independent Web Development Suite & Live Preview Studio**  
> Lingkungan pengembangan web mandiri (*self-hosted*) dengan Live Preview, Terminal Swarm (Thinker & Worker), dan integrasi AI CLI (OpenCode, Antigravity, CommandCode). Dapat dijalankan di Linux, Windows, macOS, maupun Termux Android.

---

## Ringkasan Eksekutif

**ArtaStudio** dirancang sebagai studio pengembangan web independen yang menggabungkan kontrol versi Git, terminal interaktif berbasis Web PTY, manajemen multi-proyek, audit keamanan pra-publikasi, dan Live Preview terisolasi dalam satu antarmuka terpadu.

Arsitektur sistem mendukung mode desktop layar penuh maupun antarmuka responsif mobile dengan sinkronisasi sesi persisten lintas proyek tanpa pemutusan proses latar belakang.

---

## Fitur Utama

### 1. Dual-Role Terminal Runtime (Thinker & Worker Swarm)
- **Terminal Pemikir:** Konsol khusus untuk perencanaan arsitektur, diskusi tugas, dan evaluasi perubahan kode bersama AI planner.
- **Terminal Worker Pool:** Instance pekerja paralel independen (dapat dikonfigurasi 1 hingga 32 worker) untuk mengeksekusi instruksi koding, instalasi dependensi, dan pengujian secara simultan.
- **Autentikasi Server-Centric:** Satu kali otentikasi CLI pada server otomatis diwarisi oleh seluruh worker yang di-spawn tanpa konfigurasi ulang.
- **Persistensi Multi-Proyek:** Proses terminal tidak dimatikan saat berpindah antar proyek atau saat koneksi browser terputus sementara.

### 2. Penjelajah Workspace & Sidebar Collapsed Rail
- Manajemen multi-repositori dan pemilihan worktree/cabang Git secara langsung.
- Mode sidebar fleksibel dengan rel vertikal minimalis yang menampilkan status dan jumlah proyek aktif.

### 3. Live Preview & Kontrol Responsif
- Integrasi viewport interaktif dengan dukungan Hot Module Replacement (HMR).
- Pengatur ukuran layar terstandarisasi: Desktop, Tablet (768px), dan Mobile (375px).
- Navigator rute halaman instan untuk inspeksi langsung antarmuka aplikasi target.

### 4. Audit Keamanan & Pre-Flight Check
- Inspeksi otomatis celah keamanan database (Row-Level Security PostgreSQL), potensi kebocoran API keys, dan kerentanan dependensi (CVE).
- Integrasi instruksi remediasi otomatis langsung ke terminal aktif.

### 5. Dukungan Perangkat Sentuh (Mobile & Android)
- Bilah bantuan tombol virtual (`Esc`, `Tab`, `Ctrl+C`, tombol panah navigasi, `PgUp`, `PgDn`).
- Kotak masukan teks langsung untuk kenyamanan pengetikan pada keyboard virtual smartphone.

---

## Panduan Instalasi & Pengoperasian

### Prasyarat Sistem
- **Node.js:** Versi `>= 18.0.0` (Direkomendasikan v20 LTS atau v22 LTS)
- **npm:** Versi `>= 9.0.0`
- **Git CLI:** Terpasang di sistem operasi

### Pemasangan Cepat

```bash
# 1. Clone repositori
git clone https://github.com/chusni12/artastudio.git
cd artastudio

# 2. Pasang dependensi (otomatis mem-build frontend client)
npm install
```

### Menjalankan Server Studio

#### Melalui npm:
```bash
npm start
```

#### Menjadikan Perintah Global di Sistem (Direkomendasikan):
```bash
npm link
artastudio
```

Aplikasi studio dapat diakses melalui browser pada alamat:  
`http://localhost:4000`

---

## Perintah Perawatan & Kontrol CLI

CLI bawaan `artastudio` menyediakan serangkaian sub-perintah untuk otomasi lingkungan:

| Perintah | Deskripsi |
| :--- | :--- |
| `artastudio` | Menjalankan server ArtaStudio di `http://localhost:4000` |
| `artastudio update` | Menarik pembaruan dari GitHub, auto-stash konflik lokal, dan kompilasi ulang client |
| `artastudio stop` | Menghentikan seluruh proses server ArtaStudio yang aktif di port target |
| `artastudio status` | Memeriksa status operasional server studio |
| `artastudio build` | Mem-build ulang bundel frontend client (`client/dist`) |
| `artastudio info` | Menampilkan metadata proyek, status framework, dan environment JSON |
| `artastudio preview start` | Menjalankan server dev Live Preview proyek target di latar belakang |
| `artastudio preview status` | Memeriksa ketersediaan dan port Live Preview proyek target |
| `artastudio preview stop` | Menghentikan server dev Live Preview proyek target |

---

## Pengoperasian di Termux Android

ArtaStudio dapat beroperasi secara mandiri (*standalone*) pada lingkungan Termux Android:

```bash
# Pembaruan paket dasar
pkg update && pkg install nodejs git

# Pemasangan ArtaStudio
git clone https://github.com/chusni12/artastudio.git
cd artastudio
npm install
npm start
```

Akses studio melalui browser Android pada `http://localhost:4000`.

---

## Struktur Direktori

```text
artastudio/
├── bin/                      # CLI launcher dan pengendali runtime sistem
├── client/                   # Sumber kode antarmuka (Vite, React, Tailwind CSS, Xterm)
│   ├── src/
│   │   ├── components/       # Komponen modular (Terminal, Hub, Modals, Viewport)
│   │   └── services/         # Layanan client-side (IndexedDB, WebSocket, API bridge)
│   └── dist/                 # Hasil kompilasi bundel frontend siap saji
├── server/                   # Backend API dan WebSocket PTY Server
│   ├── routes/               # REST API endpoints (Workspaces, Process, Security, Git)
│   └── services/             # Core engines (TerminalManager, ProcessManager, GitService)
└── shared/                   # Definisi tipe TypeScript bersama
```

---

## Lisensi & Kontribusi

Hak Cipta © 2026 **ArtaStudio Project**.  
Dikembangkan untuk mendukung otomasi rekayasa perangkat lunak berbasis AI yang mandiri, aman, dan efisien.
