#!/usr/bin/env node

/**
 * ArtaStudio - Global CLI Launcher & Auto-Updater (Windows, Linux, macOS)
 * Mendukung: artastudio, artastudio update, artastudio latest, artastudio stop, artastudio status
 */

import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const command = (args[0] || 'start').toLowerCase();

const PORT = process.env.ARTASTUDIO_PORT || process.env.PORT || '4000';
const isWindows = process.platform === 'win32';

function parseCliFlags(rawArgs) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const token = rawArgs[i];
    if (token.startsWith('--')) {
      const eqIdx = token.indexOf('=');
      if (eqIdx !== -1) {
        const key = token.slice(2, eqIdx).toLowerCase();
        flags[key] = token.slice(eqIdx + 1);
      } else {
        const key = token.slice(2).toLowerCase();
        const next = rawArgs[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = 'true';
        }
      }
    } else {
      positionals.push(token);
    }
  }
  return { flags, positionals };
}

function postJsonToStudio(endpointPath, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: Number(PORT) || 4000,
        path: endpointPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data || '{}');
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            } else {
              resolve({ success: true, raw: data });
            }
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout menghubungi server ArtaStudio'));
    });
    req.write(body);
    req.end();
  });
}

function printBanner() {
  console.log('==========================================================');
  console.log('   ARTASTUDIO - Independent AI Web Development Suite');
  console.log('==========================================================');
  console.log(`  ➜ Studio URL       : http://localhost:${PORT}`);
  console.log('  ➜ Mode             : Localhost Studio CLI');
  console.log('  ➜ Perintah Update  : artastudio update (atau artastudio latest)');
  console.log('  ➜ Cara Menutup     : Tekan [Ctrl + C] atau ketik "artastudio stop"');
  console.log('==========================================================');
}

// ==============================================================================

// ==============================================================================
// 1B. Perintah: artastudio preview / info / notify
// ==============================================================================
if (command === "info") {
  const cwd = process.cwd();
  let projectName = path.basename(cwd);
  let framework = "Vite React";
  let previewUrl = "http://localhost:5173";
  if (fs.existsSync(path.join(cwd, "wrangler.jsonc")) || fs.existsSync(path.join(cwd, "wrangler.json"))) {
    framework = "Cloudflare Workers / Vite";
  }
  if (projectName.toLowerCase().includes("artaloka") || cwd.includes("bowhead")) {
    previewUrl = "http://localhost:5199";
  } else if (projectName.toLowerCase().includes("tahqiq")) {
    previewUrl = "http://localhost:3000";
  }
  console.log(JSON.stringify({
    studio: "ArtaStudio AI Web Development Suite",
    projectName,
    projectPath: cwd,
    framework,
    previewUrl,
    environment: {
      ARTASTUDIO: "true",
      NODE_ENV: process.env.NODE_ENV || "development"
    }
  }, null, 2));
  process.exit(0);
}

if (command === "preview") {
  const sub = (args[1] || "status").toLowerCase();
  const cwd = process.cwd();
  const projectName = path.basename(cwd);
  let defaultPort = "5173";
  if (projectName.toLowerCase().includes("artaloka") || cwd.includes("bowhead")) {
    defaultPort = "5199";
  } else if (projectName.toLowerCase().includes("tahqiq")) {
    defaultPort = "3000";
  }

  if (sub === "start" || sub === "run") {
    console.log(`[ArtaStudio CLI] Menyalakan Live Preview server untuk ${projectName} di port ${defaultPort}...`);
    const devProc = spawn("npm", ["run", "dev", "--", "--port", defaultPort, "--host", "127.0.0.1"], {
      cwd,
      stdio: "inherit",
      shell: true,
      detached: true
    });
    devProc.unref();
    console.log(`✅ Live Preview server dimulai di background! URL: http://localhost:${defaultPort}`);
    process.exit(0);
  } else if (sub === "stop") {
    console.log(`[ArtaStudio CLI] Menghentikan dev server di port ${defaultPort}...`);
    try {
      execSync(`lsof -ti :${defaultPort} | xargs kill -9`, { stdio: "ignore" });
      console.log(`✅ Dev server di port ${defaultPort} berhasil dihentikan.`);
    } catch {
      console.log(`ℹ️ Tidak ada dev server yang aktif di port ${defaultPort}.`);
    }
    process.exit(0);
  } else {
    // status
    let active = false;
    try {
      const out = execSync(`lsof -ti :${defaultPort}`, { encoding: "utf-8" }).trim();
      active = Boolean(out);
    } catch {}
    console.log(JSON.stringify({
      projectName,
      port: defaultPort,
      url: `http://localhost:${defaultPort}`,
      status: active ? "running" : "stopped"
    }, null, 2));
    process.exit(0);
  }
}

// ==============================================================================
// 1C. Perintah: artastudio dispatch & artastudio report (Orchestrator Worker 1..32)
// ==============================================================================
if (command === 'dispatch') {
  const { flags, positionals } = parseCliFlags(args.slice(1));
  const workerId = Math.min(Math.max(parseInt(flags.worker || '1', 10) || 1, 1), 32);
  const projectPath = path.resolve(flags.path || process.env.ARTASTUDIO_PROJECT_PATH || process.cwd());
  const task = (flags.task || positionals.join(' ')).trim();
  const agent = flags.agent ? flags.agent.trim() : undefined;

  if (!task) {
    console.error('❌ Parameter --task "<deskripsi tugas>" wajib diisi.');
    process.exit(1);
  }

  try {
    const result = await postJsonToStudio('/api/orchestrator/dispatch', {
      projectPath,
      workerId,
      task,
      agent,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal melakukan dispatch ke worker:', err.message);
    process.exit(1);
  }
}

if (command === 'report') {
  const { flags, positionals } = parseCliFlags(args.slice(1));
  const workerId = Math.min(
    Math.max(parseInt(flags.worker || process.env.ARTASTUDIO_WORKER_ID || '1', 10) || 1, 1),
    32
  );
  const status = (flags.status || 'DONE').toUpperCase();
  const projectPath = path.resolve(flags.path || process.env.ARTASTUDIO_PROJECT_PATH || process.cwd());
  const summary = (flags.summary || positionals.join(' ')).trim();

  if (!summary) {
    console.error('❌ Parameter --summary "<ringkasan hasil>" wajib diisi.');
    process.exit(1);
  }

  try {
    const result = await postJsonToStudio('/api/orchestrator/report', {
      projectPath,
      workerId,
      status,
      summary,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal mengirim report ke pemikir:', err.message);
    process.exit(1);
  }
}

// 1. Perintah: artastudio help
// ==============================================================================
if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`
Panduan Penggunaan ArtaStudio CLI:
  artastudio           : Menjalankan server studio di http://localhost:4000
  artastudio update    : Menarik update terbaru dari GitHub & auto-build ulang (artastudio latest)
  artastudio latest    : Sama dengan perintah update
  artastudio stop      : Menghentikan server studio yang sedang berjalan di port 4000
  artastudio status    : Memeriksa apakah server studio sedang berjalan
  artastudio build     : Mem-build frontend UI client secara manual
  artastudio dispatch  : Mengirim tugas ke Worker 1..32 (--worker <N> [--agent <cli>] [--path <dir>] --task "<text>")
  artastudio report    : Mengirim laporan hasil Worker ke Pemikir (--worker <N> [--status DONE|FAILED|BLOCKED] --summary "<text>")
  artastudio --help    : Menampilkan bantuan ini
`);
  process.exit(0);
}

// ==============================================================================
// Util: deteksi proses ArtaStudio (fallback ketika lsof/netstat tidak bisa
// membaca port, misal di Termux/container dengan batasan /proc)
// ==============================================================================
function findArtastudioPids() {
  const pids = [];
  try {
    const out = execSync('ps -eo pid=,args=', { encoding: 'utf-8' });
    for (const line of out.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!m) continue;
      const [, pid, args] = m;
      if (!/(server\/index\.ts|tsx watch|concurrently|vite client)/.test(args)) continue;
      // Hanya proses yang berjalan di folder project ini
      try {
        const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
        if (cwd === projectRoot || cwd.startsWith(projectRoot + path.sep)) pids.push(pid);
      } catch {
        /* /proc tidak tersedia: lewati */
      }
    }
  } catch {
    /* ps gagal: biarkan */
  }
  return pids;
}

// ==============================================================================
// 2. Perintah: artastudio stop / exit
// ==============================================================================
if (command === 'stop' || command === 'exit' || command === 'kill' || command === 'down') {
  console.log(`Menghentikan seluruh proses ArtaStudio di port ${PORT}...`);
  let stopped = false;
  try {
    if (isWindows) {
      execSync(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${PORT}') do taskkill /f /pid %a`, {
        shell: 'cmd.exe',
        stdio: 'ignore',
      });
      stopped = true;
    } else {
      try {
        const out = execSync(`lsof -ti :${PORT}`, { encoding: 'utf-8' }).trim();
        if (out) {
          execSync(`kill -9 ${out.split(/\s+/).join(' ')}`, { stdio: 'ignore' });
          stopped = true;
        }
      } catch {
        /* lsof tidak bisa membaca port -> pakai fallback di bawah */
      }
      if (!stopped) {
        const pids = findArtastudioPids();
        if (pids.length) {
          execSync(`kill -9 ${pids.join(' ')}`, { stdio: 'ignore' });
          stopped = true;
        }
      }
    }
  } catch {
    /* biarkan */
  }
  console.log(
    stopped
      ? '✅ ArtaStudio berhasil ditutup sepenuhnya!'
      : `ℹ️ Tidak ada ArtaStudio yang sedang berjalan di port ${PORT}.`
  );
  process.exit(0);
}

// ==============================================================================
// 3. Perintah: artastudio status
// ==============================================================================
if (command === 'status') {
  const ping = () =>
    new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port: Number(PORT) || 4000, path: '/', timeout: 2000 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });

  let alive = await ping();
  if (!alive && !isWindows) {
    try {
      const out = execSync(`lsof -ti :${PORT}`, { encoding: 'utf-8' }).trim();
      alive = Boolean(out);
    } catch {
      alive = findArtastudioPids().length > 0;
    }
  }
  if (alive) {
    console.log(`🟢 ArtaStudio AKTIF berjalan di http://localhost:${PORT}`);
  } else {
    console.log('🔴 ArtaStudio sedang TIDAK BERJALAN.');
  }
  process.exit(0);
}

// ==============================================================================
// 4. Perintah: artastudio update / artastudio latest
// ==============================================================================
if (command === 'update' || command === 'latest' || command === 'upgrade') {
  console.log('==========================================================');
  console.log('   🔄 ARTASTUDIO AUTO-UPDATER: PULLING LATEST COMMITS');
  console.log('==========================================================');
  try {
    console.log('[1/3] Menarik pembaruan kode terbaru dari remote GitHub...');
    try {
      execSync('git pull origin main', { cwd: projectRoot, stdio: 'inherit', shell: isWindows });
    } catch (pullErr) {
      // Jika ada perubahan file lokal yang bentrok di Windows/Termux, amankan dengan stash lalu pull ulang
      console.log('ℹ️ Mendeteksi perubahan file lokal, mengamankan dengan auto-stash & pull ulang...');
      try {
        execSync('git stash', { cwd: projectRoot, stdio: 'ignore', shell: isWindows });
        execSync('git pull origin main', { cwd: projectRoot, stdio: 'inherit', shell: isWindows });
      } catch (retryErr) {
        throw new Error(pullErr.message);
      }
    }

    console.log('\n[2/3] Memeriksa & memasang dependensi baru jika ada...');
    execSync('npm install --no-audit', { cwd: projectRoot, stdio: 'inherit', shell: isWindows });

    console.log('\n[3/3] Meng-compile ulang frontend client UI (Vite)...');
    execSync('npx vite build client', { cwd: projectRoot, stdio: 'inherit', shell: isWindows });

    console.log('\n==========================================================');
    console.log('   ✅ UPDATE SUKSES! ArtaStudio Anda sudah versi paling mutakhir.');
    console.log('   Ketik "artastudio" untuk langsung menyalakan studio!');
    console.log('==========================================================');
  } catch (err) {
    console.error('\n❌ Gagal melakukan auto-update:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

// ==============================================================================
// 5. Perintah: artastudio build
// ==============================================================================
if (command === 'build') {
  console.log('[ArtaStudio] Building client UI...');
  const buildProc = spawn('npx', ['vite', 'build', 'client'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });
  buildProc.on('close', (code) => {
    process.exit(code || 0);
  });
} else {
  // Check if client/dist exists; if not, build it first automatically!
  const clientDist = path.join(projectRoot, 'client', 'dist');
  if (!fs.existsSync(clientDist)) {
    console.log('[ArtaStudio] Frontend bundle belum ada. Menjalankan auto-build client pertama kali...');
    try {
      execSync('npx vite build client', { cwd: projectRoot, stdio: 'inherit', shell: isWindows });
    } catch (e) {
      console.warn('[ArtaStudio] Warning: Auto-build client gagal. Menjalankan server fallback...');
    }
  }

  printBanner();

  const serverFile = path.join(projectRoot, 'server', 'index.ts');
  const serverProc = spawn(process.execPath,[path.join(projectRoot,'node_modules','tsx','dist','cli.mjs'),serverFile],{cwd:projectRoot,stdio:'inherit',
    env: {
      ...process.env,
      PORT,
    },
  });

  serverProc.on('close', (code) => {
    process.exit(code || 0);
  });

  process.on('SIGINT', () => {
    serverProc.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    serverProc.kill('SIGTERM');
    process.exit(0);
  });
}
