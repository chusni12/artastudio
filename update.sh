#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=========================================================="
echo "   ARTASTUDIO AUTO-UPDATER FOR LINUX / MAC / TERMUX"
echo "=========================================================="
echo "[1/3] Menarik update terbaru dari GitHub main..."
git pull origin main

echo ""
echo "[2/3] Memeriksa dependensi package..."
npm install --no-audit

echo ""
echo "[3/3] Meng-compile ulang frontend client UI (Vite)..."
npx vite build client

echo ""
echo "=========================================================="
echo "   UPDATE SUKSES! ArtaStudio siap dijalankan."
echo "=========================================================="
