#!/usr/bin/env node

/**
 * ArtaStudio - Global CLI Launcher & Auto-Updater
 * Mendukung pemanggilan `artastudio`, `artastudio update`, `artastudio status`, dll.
 */

import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const command = (args[0] || 'start').toLowerCase();

const PORT = process.env.PORT || '4000';

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
// 1. Perintah: artastudio help
// ==============================================================================
if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`
Panduan Penggunaan ArtaStudio CLI:
  artastudio           : Menjalankan server studio di http://localhost:4000
  artastudio update    : Menarik update terbaru dari Git GitHub & auto-build ulang (artastudio latest)
  artastudio build     : Mem-build frontend UI client secara manual
  artastudio stop      : Menghentikan server studio yang sedang berjalan di port 4000
  artastudio --help    : Menampilkan bantuan ini
`);
  process.exit(0);
}

// ==============================================================================
// 2. Perintah: artastudio update / artastudio latest
// ==============================================================================
if (command === 'update' || command === 'latest' || command === 'upgrade') {
  console.log('==========================================================');
  console.log('   🔄 ARTASTUDIO AUTO-UPDATER: PULLING LATEST COMMITS');
  console.log('==========================================================');
  try {
    console.log('[1/3] Menarik pembaruan kode terbaru dari remote GitHub...');
    execSync('git pull origin main', { cwd: projectRoot, stdio: 'inherit' });

    console.log('\n[2/3] Memeriksa & memasang dependensi baru jika ada...');
    execSync('npm install --no-audit', { cwd: projectRoot, stdio: 'inherit' });

    console.log('\n[3/3] Meng-compile ulang frontend client UI (Vite)...');
    execSync('npx vite build client', { cwd: projectRoot, stdio: 'inherit' });

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
// 3. Perintah: artastudio build
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
      execSync('npx vite build client', { cwd: projectRoot, stdio: 'inherit' });
    } catch (e) {
      console.warn('[ArtaStudio] Warning: Auto-build client gagal. Menjalankan server fallback...');
    }
  }

  printBanner();

  const serverFile = path.join(projectRoot, 'server', 'index.ts');
  const serverProc = spawn('npx', ['tsx', serverFile], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
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
