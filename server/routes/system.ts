import { Router, Request, Response } from 'express';
import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { broadcastWebSocketEvent } from '../ws';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const studioRoot = path.resolve(__dirname, '../..');

export interface LatestCommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  commitsBehind: number;
  localHash?: string;
  remoteHash?: string;
  latestCommit: LatestCommitInfo | null;
  checkedAt: string;
  offline?: boolean;
  fetchError?: string;
}

const router = Router();

let isUpdating = false;
let inFlightCheck: Promise<UpdateCheckResult> | null = null;
let lastCheckResult: UpdateCheckResult | null = null;
let lastCheckAt = 0;
let lastNotifiedHash: string | null = null;

async function runGit(args: string[], timeout = 15000): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: studioRoot,
    timeout,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

export async function checkForUpdates(force = false): Promise<UpdateCheckResult> {
  if (!force && lastCheckResult && Date.now() - lastCheckAt < 5000) {
    return lastCheckResult;
  }

  if (inFlightCheck) {
    return inFlightCheck;
  }

  inFlightCheck = (async (): Promise<UpdateCheckResult> => {
    let fetchError: string | undefined;
    try {
      await runGit(['fetch', 'origin', 'main', '--quiet'], 15000);
    } catch (err: any) {
      fetchError = err?.message || 'Gagal menghubungi remote GitHub';
    }

    let localHash = '';
    let remoteHash = '';
    let commitsBehind = 0;
    let latestCommit: LatestCommitInfo | null = null;

    try {
      localHash = await runGit(['rev-parse', 'HEAD'], 5000);
    } catch {
      localHash = '';
    }

    try {
      remoteHash = await runGit(['rev-parse', 'origin/main'], 5000);
    } catch {
      remoteHash = '';
    }

    if (localHash && remoteHash) {
      try {
        const countStr = await runGit(['rev-list', 'HEAD..origin/main', '--count'], 5000);
        commitsBehind = parseInt(countStr, 10) || 0;
      } catch {
        commitsBehind = 0;
      }

      try {
        const rawLog = await runGit(
          ['log', '-1', 'origin/main', '--format=%H%x1f%h%x1f%s%x1f%an%x1f%cI'],
          5000
        );
        const [hash, shortHash, message, author, date] = rawLog.split('\x1f');
        if (hash) {
          latestCommit = {
            hash,
            shortHash: shortHash || hash.slice(0, 7),
            message: message || 'Pembaruan tersedia',
            author: author || 'Developer',
            date: date || new Date().toISOString(),
          };
        }
      } catch {
        latestCommit = null;
      }
    }

    const hasUpdate = Boolean(
      localHash &&
      remoteHash &&
      localHash !== remoteHash &&
      commitsBehind > 0
    );

    const result: UpdateCheckResult = {
      hasUpdate,
      commitsBehind,
      localHash: localHash || undefined,
      remoteHash: remoteHash || undefined,
      latestCommit,
      checkedAt: new Date().toISOString(),
      ...(fetchError ? { offline: true, fetchError } : {}),
    };

    lastCheckResult = result;
    lastCheckAt = Date.now();

    if (hasUpdate && remoteHash && remoteHash !== lastNotifiedHash) {
      lastNotifiedHash = remoteHash;
      broadcastWebSocketEvent('system', 'update:available', result);
    }

    return result;
  })();

  try {
    return await inFlightCheck;
  } finally {
    inFlightCheck = null;
  }
}

export function startSystemUpdateChecker(intervalMs = 45000): NodeJS.Timeout {
  const timer = setInterval(() => {
    if (isUpdating) return;
    checkForUpdates(true).catch(() => {});
  }, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

// GET /api/system/check-update
router.get('/check-update', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === '1' || req.query.force === 'true';
    const result = await checkForUpdates(force);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      hasUpdate: false,
      commitsBehind: 0,
      latestCommit: null,
      error: err?.message || 'Gagal memeriksa pembaruan',
    });
  }
});

// POST /api/system/apply-update
router.post('/apply-update', async (_req: Request, res: Response) => {
  if (isUpdating) {
    return res.status(409).json({
      success: false,
      message: 'Proses pembaruan sedang berjalan...',
    });
  }

  isUpdating = true;

  try {
    let beforeHead = '';
    try {
      beforeHead = await runGit(['rev-parse', 'HEAD'], 5000);
    } catch {
      beforeHead = '';
    }

    broadcastWebSocketEvent('system', 'update:progress', {
      step: 'pulling',
      message: 'Menarik update...',
      detail: 'Menjalankan git pull origin main',
      progress: 25,
    });

    let runGitOutput = '';
    try {
      runGitOutput = await runGit(['pull', 'origin', 'main'], 60000);
    } catch (pullErr: any) {
      // Jika git pull ditolak karena konflik editan lokal di HP/Termux, lakukan stash/rebase otomatis
      try {
        await runGit(['stash'], 10000);
        runGitOutput = await runGit(['pull', 'origin', 'main'], 60000);
      } catch (retryErr: any) {
        throw new Error(retryErr?.stderr || retryErr?.message || pullErr?.stderr || pullErr?.message);
      }
    }

    let afterHead = '';
    try {
      afterHead = await runGit(['rev-parse', 'HEAD'], 5000);
    } catch {
      afterHead = '';
    }

    if (beforeHead && afterHead && beforeHead !== afterHead) {
      try {
        const changedFiles = await runGit(['diff', '--name-only', beforeHead, afterHead], 5000);
        if (/\bpackage(-lock)?\.json\b/.test(changedFiles)) {
          broadcastWebSocketEvent('system', 'update:progress', {
            step: 'installing',
            message: 'Memperbarui dependensi...',
            detail: 'Menjalankan npm install --no-audit',
            progress: 50,
          });
          await execAsync('npm install --no-audit', {
            cwd: studioRoot,
            timeout: 120000,
            maxBuffer: 4 * 1024 * 1024,
          });
        }
      } catch {
        // Proceed to client build even if diff check had an issue
      }
    }

    broadcastWebSocketEvent('system', 'update:progress', {
      step: 'building',
      message: 'Meng-compile client...',
      detail: 'Menjalankan npx vite build client',
      progress: 75,
    });

    await execAsync('npx vite build client', {
      cwd: studioRoot,
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    });

    lastCheckResult = null;
    lastCheckAt = 0;
    lastNotifiedHash = afterHead || null;

    broadcastWebSocketEvent('system', 'update:progress', {
      step: 'done',
      message: 'Selesai!',
      detail: 'Pembaruan Berhasil Dipasang! Memuat ulang...',
      progress: 100,
    });

    res.json({
      success: true,
      message: 'Update berhasil dipasang!',
    });
  } catch (err: any) {
    const errMsg = err?.stderr || err?.message || 'Gagal memasang pembaruan';
    broadcastWebSocketEvent('system', 'update:progress', {
      step: 'error',
      message: 'Gagal memasang pembaruan',
      detail: String(errMsg).trim(),
      progress: 0,
    });

    res.status(500).json({
      success: false,
      message: 'Gagal memasang pembaruan',
      error: String(errMsg).trim(),
    });
  } finally {
    isUpdating = false;
  }
});

export default router;
