#!/usr/bin/env node

/**
 * ArtaStudio - Global CLI Launcher
 * Memungkinkan pemanggilan `artastudio` langsung dari terminal di mana saja.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const command = args[0] || 'start';

const PORT = process.env.PORT || '4000';

function printBanner() {
  console.log('==========================================================');
  console.log('   ARTASTUDIO - Independent AI Web Development Suite');
  console.log('==========================================================');
  console.log(`  ➜ Studio URL       : http://localhost:${PORT}`);
  console.log('  ➜ Mode             : Localhost Studio CLI');
  console.log('  ➜ Cara Menutup     : Tekan [Ctrl + C]');
  console.log('==========================================================');
}

if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`
Panduan Penggunaan ArtaStudio CLI:
  artastudio         : Menjalankan server studio di http://localhost:4000
  artastudio dev     : Mode development dengan hot-reloading
  artastudio build   : Mem-build frontend client untuk produksi
  artastudio --help  : Menampilkan bantuan ini
`);
  process.exit(0);
}

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
      const { execSync } = await import('node:child_process');
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
