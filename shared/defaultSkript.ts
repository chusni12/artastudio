/**
 * ArtaStudio - Embedded Canonical Orchestration Protocol (skript.md)
 * Pemikir (Lead Strategic Architect) & 32 Worker (worker-1..worker-32)
 */

export const DEFAULT_SKRIPT_MD = `# Protokol Orkestrasi Pemikir & 32 Worker (\`skript.md\`)

Dokumen ini adalah pedoman resmi pembagian peran antara **Pemikir (Lead Strategic Architect / Orchestrator)** dan **Worker 1–32 (Hands-on Engineers)** di ekosistem **ArtaStudio**, melengkapi aturan di \`AGENTS.md\`.

---

## 1. Pemisahan Tugas Mutlak

### A. Pemikir (Architect, Delegator & DoD Reviewer)
1. **Hanya Berpikir & Merancang:** Pemikir bertugas memahami kebutuhan user, melakukan audit/riset kode secara **read-only**, merancang arsitektur, mengidentifikasi risiko (keamanan RLS, SSR hydration, batas ukuran bundle, build/CI), dan memecah pekerjaan menjadi tugas yang jelas.
2. **Dilarang Coding Langsung:** Pemikir **TIDAK BOLEH mengedit file kode implementasi** secara langsung. Seluruh penulisan kode, refactoring, dan eksekusi perbaikan wajib didelegasikan ke **Worker** (dimulai dari **Worker 1**).
3. **Gatekeeper Definition of Done (DoD):** Setelah Worker selesai dan melapor balik, Pemikir wajib melakukan verifikasi independen (\`git diff\`, \`typecheck\`, \`test\`, \`build\`) sebelum melaporkan hasil final ke User.

### B. Worker 1 s/d Worker 32 (Hands-on Executors)
1. **Default Mulai dari Worker 1:** Semua pekerjaan implementasi tunggal atau berurutan didelegasikan ke **Worker 1** terlebih dahulu agar efisien dan bebas konflik file.
2. **Eksekusi Presisi:** Worker membaca rentang kode yang relevan saja, mengerjakan perubahan **strictly within \`SCOPE_FILES\`**, menjalankan verifikasi typecheck/test/build yang diminta, dan tidak menyentuh file lain di luar batas tugas.
3. **Pelaporan Otomatis:** Begitu selesai (atau terblokir/gagal), Worker wajib mengembalikan laporan terstruktur ke Pemikir secara otomatis melalui blok \`[WORKER REPORT]...[/WORKER REPORT]\` atau CLI \`artastudio report\`.

---

## 2. Skalabilitas Paralel Hingga 32 Worker

Pemikir dapat memecah proyek besar secara paralel hingga **maksimal 32 Worker (\`worker-1\` s/d \`worker-32\`)** dengan aturan anti-bentrok berikut:

1. **Disjoint File Ownership (Wajib):** Dua worker yang berjalan paralel **dilarang mengedit file yang sama**. Pemikir wajib menentukan \`SCOPE_FILES\` masing-masing worker secara terpisah.
2. **File Bersama Ditangani Serial / 1 Worker:** File konfigurasi terpusat (\`package.json\`, \`package-lock.json\`, root router/layout) hanya boleh dimiliki satu worker pada satu waktu.
3. **Isolasi & Verifikasi Terpusat:** Batasi paralelisme hanya pada file yang benar-benar terpisah, lalu jalankan verifikasi \`typecheck\`, \`test\`, dan \`build\` terpusat di akhir setelah semua worker selesai.

---

## 3. Cara Delegasi Pemikir ke Worker (\`1..32\`)

### Opsi A — Blok Terstruktur (Otomatis Ditangkap ArtaStudio Orchestrator)
Cetak blok berikut di terminal Pemikir (pastikan selalu menyertakan tag penutup \`[/DISPATCH TO WORKER]\`):

\`\`\`markdown
[DISPATCH TO WORKER]
WORKER_ID: worker-1          # worker-1 .. worker-32
AGENT: agy                   # opsional: agy | opencode | commandcode
MODEL_TIER: flash            # flash | inherit | pro
WORKSPACE_MODE: inherit      # inherit | share | branch
SCOPE_FILES:
  - <daftar path file yang boleh dibuat/diubah>
FORBIDDEN_FILES:
  - <daftar path file yang dilarang disentuh>
OBJECTIVE:
  <ringkasan tujuan teknis yang jelas>
STEPS:
  1. <langkah spesifik>
  2. <langkah spesifik>
ACCEPTANCE_CRITERIA:
  - <syarat lulus, misal typecheck, test, dan build exit 0>
AUTO_REPORT_TO: pemikir
[/DISPATCH TO WORKER]
\`\`\`

### Opsi B — Perintah CLI Langsung
Pemikir juga dapat memicu worker secara langsung lewat shell CLI:

\`\`\`bash
artastudio dispatch --worker 1 --agent agy --task "Ringkasan tugas + daftar SCOPE_FILES + kriteria DoD"
\`\`\`

---

## 4. Protokol Auto-Report Worker -> Pemikir

Begitu Worker menyelesaikan tugas atau menemui kendala, Worker **WAJIB** melapor ke Pemikir dengan salah satu cara berikut:

### Opsi A — Blok Laporan Terstruktur
\`\`\`markdown
[WORKER REPORT]
WORKER_ID: worker-1
STATUS: DONE                 # DONE | BLOCKED | FAILED
FILES_CHANGED:
  - <path file> (<ringkasan perubahan>)
CHECKS_RUN:
  - typecheck => exit 0
  - test => exit 0
  - build => exit 0
BLOCKERS:
  - NONE
[/WORKER REPORT]
\`\`\`

### Opsi B — Perintah CLI Auto-Report
\`\`\`bash
artastudio report --worker 1 --status DONE --summary "Ringkasan perubahan & hasil typecheck/test/build"
\`\`\`

Setelah laporan diterima:
1. Pemikir **tidak melakukan polling berulang**; tab Pemikir menerima notifikasi \`[AUTO-REPORT WORKER <N>]\` secara otomatis.
2. Pemikir mengaudit \`git diff\` dan memverifikasi DoD (\`typecheck\`, \`test\`, \`build\`) secara langsung.
3. Jika ada kekurangan, Pemikir mengirim revisi spesifik kembali ke Worker terkait.
`;
