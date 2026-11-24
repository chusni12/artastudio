@echo off
echo ==========================================================
echo    ARTASTUDIO AUTO-UPDATER FOR WINDOWS
echo ==========================================================
cd /d "%~dp0"

echo [1/3] Menarik update terbaru dari GitHub main...
git pull origin main

echo.
echo [2/3] Memeriksa dependensi package...
call npm install --no-audit

echo.
echo [3/3] Meng-compile ulang frontend client UI (Vite)...
call npx vite build client

echo.
echo ==========================================================
echo    UPDATE SUKSES! ArtaStudio siap dijalankan.
echo ==========================================================
pause
