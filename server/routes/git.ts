import { Router, Request, Response } from 'express';
import { exec, spawn } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import type { CommitInfo, CommitDiff } from '../../shared/types';
import { broadcastWebSocketEvent } from '../ws';

const execAsync = util.promisify(exec);
const router = Router();

// ============================================================================
// Git Watcher (Polling berkala 3 detik deteksi commit baru -> WebSocket event)
// ============================================================================
let activeWatchedProjectPath: string = process.cwd();
const lastKnownHeadCommits = new Map<string, string>();
let isCheckingCommits = false;

export function setActiveWatchedProjectPath(targetPath: string) {
  try {
    const resolved = path.resolve(targetPath);
    if (fs.existsSync(resolved)) {
      activeWatchedProjectPath = resolved;
      if (!lastKnownHeadCommits.has(resolved)) {
        execAsync('git rev-parse HEAD', { cwd: resolved })
          .then(({ stdout }) => {
            const head = stdout.trim();
            if (head) lastKnownHeadCommits.set(resolved, head);
          })
          .catch(() => {});
      }
    }
  } catch {}
}

async function checkWatchedCommits() {
  if (isCheckingCommits) return;
  isCheckingCommits = true;
  try {
    const targetPath = activeWatchedProjectPath;
    if (!fs.existsSync(targetPath)) return;

    let isGit = false;
    try {
      await execAsync('git rev-parse --is-inside-work-tree', { cwd: targetPath });
      isGit = true;
    } catch {
      return;
    }

    if (!isGit) return;

    let currentHead = '';
    try {
      const { stdout: hOut } = await execAsync('git rev-parse HEAD', { cwd: targetPath });
      currentHead = hOut.trim();
    } catch {
      return;
    }

    if (!currentHead) return;

    // Jika ini pertama kali periksa proyek ini, simpan sebagai baseline tanpa memancarkan event
    if (!lastKnownHeadCommits.has(targetPath)) {
      lastKnownHeadCommits.set(targetPath, currentHead);
      return;
    }

    const previousHead = lastKnownHeadCommits.get(targetPath);
    if (previousHead && previousHead !== currentHead) {
      // Terdeteksi commit baru!
      lastKnownHeadCommits.set(targetPath, currentHead);

      let hash = currentHead;
      let shortHash = currentHead.slice(0, 7);
      let author = 'Developer';
      let authorEmail = '';
      let date = new Date().toISOString();
      let message = 'Update commit';

      try {
        const { stdout: logOut } = await execAsync(
          `git log -1 --pretty=format:"%H|%h|%an|%ae|%ad|%s" --date=iso ${currentHead}`,
          { cwd: targetPath }
        );
        const parts = logOut.trim().split('|');
        if (parts.length >= 6) {
          hash = parts[0] || hash;
          shortHash = parts[1] || shortHash;
          author = parts[2] || author;
          authorEmail = parts[3] || authorEmail;
          date = parts[4] || date;
          message = parts[5] || message;
        }
      } catch {}

      let branch = 'main';
      try {
        const { stdout: bOut } = await execAsync('git branch --show-current', { cwd: targetPath });
        branch = bOut.trim() || 'main';
      } catch {
        try {
          const { stdout: refOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: targetPath });
          branch = refOut.trim() || 'main';
        } catch {}
      }

      let filesChanged = 1;
      let additions = 0;
      let deletions = 0;
      try {
        const { stdout: statOut } = await execAsync(`git diff --shortstat ${currentHead}^!`, {
          cwd: targetPath,
        });
        const fMatch = statOut.match(/(\d+)\s+file/);
        const aMatch = statOut.match(/(\d+)\s+insertion/);
        const dMatch = statOut.match(/(\d+)\s+deletion/);
        if (fMatch) filesChanged = parseInt(fMatch[1], 10);
        if (aMatch) additions = parseInt(aMatch[1], 10);
        if (dMatch) deletions = parseInt(dMatch[1], 10);
      } catch {}

      const commit = {
        id: hash,
        hash,
        shortHash,
        message,
        author,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date,
        branch,
        filesChanged,
        additions,
        deletions,
        type: parseCommitType(message),
        isGitHubSync: true,
        source: 'local',
      };

      console.log(`[Git Watcher] 🚀 Commit baru terdeteksi: ${shortHash} - "${message}" pada ${targetPath}`);
      broadcastWebSocketEvent('git', 'commit:new', { commit, projectPath: targetPath });
    }
  } catch (err: any) {
    // abaikan kesalahan polling sesaat
  } finally {
    isCheckingCommits = false;
  }
}

// Jalankan polling setiap 3 detik (3000ms)
const gitWatcherInterval = setInterval(checkWatchedCommits, 3000);
if (typeof (gitWatcherInterval as any).unref === 'function') {
  (gitWatcherInterval as any).unref();
}

// Inisialisasi awal
checkWatchedCommits().catch(() => {});

const projectGitConfigsFile = path.join(process.cwd(), 'project_git_configs.json');

function loadAllGitConfigs(): Record<string, any> {
  if (fs.existsSync(projectGitConfigsFile)) {
    try {
      return JSON.parse(fs.readFileSync(projectGitConfigsFile, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveGitConfigForProject(projectPath: string, data: Record<string, any>) {
  try {
    const all = loadAllGitConfigs();
    const resolved = path.resolve(projectPath);
    all[resolved] = { ...(all[resolved] || {}), ...data, updatedAt: new Date().toISOString() };
    fs.writeFileSync(projectGitConfigsFile, JSON.stringify(all, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Git] Failed to save project git config:', err);
  }
}

function extractRepoName(url: string): string {
  if (!url) return '';
  const cleaned = url.trim().replace(/\.git$/, '');
  const match = cleaned.match(/github\.com[:/]([^/]+\/[^/]+)$/);
  return match ? match[1] : '';
}

function sanitizeRepoUrl(url: string): string {
  if (!url) return '';
  return url.replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/').trim();
}

function parseCommitType(msg: string): CommitInfo['type'] {
  const lower = msg.toLowerCase();
  if (lower.startsWith('feat')) return 'feat';
  if (lower.startsWith('fix')) return 'fix';
  if (lower.startsWith('chore')) return 'chore';
  if (lower.startsWith('docs')) return 'docs';
  if (lower.startsWith('refactor')) return 'refactor';
  return 'other';
}

/**
 * POST /api/git/active-project
 * Set project path yang sedang aktif dipantau oleh Git Watcher
 */
router.post('/active-project', (req: Request, res: Response) => {
  const { projectPath } = req.body;
  if (projectPath && typeof projectPath === 'string') {
    setActiveWatchedProjectPath(projectPath);
    return res.json({ success: true, activeProjectPath: activeWatchedProjectPath });
  }
  return res.status(400).json({ success: false, error: 'projectPath wajib diisi' });
});

/**
 * GET /api/git/history
 */
router.get('/history', async (req: Request, res: Response) => {
  const projectPath = (req.query.path as string) || (req.query.projectPath as string) || process.cwd();
  if (projectPath) setActiveWatchedProjectPath(projectPath);
  const limit = parseInt((req.query.limit as string) || '20', 10);

  try {
    const { stdout } = await execAsync(
      `git log -n ${limit} --pretty=format:"%H|%h|%an|%ad|%s" --date=iso`,
      { cwd: projectPath }
    );

    const commits: CommitInfo[] = stdout
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [hash, shortHash, author, date, message] = line.split('|');
        return {
          hash,
          shortHash,
          author,
          date,
          message,
          type: parseCommitType(message || ''),
        };
      });

    res.json({ success: true, commits });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, commits: [] });
  }
});

/**
 * GET /api/git/diff
 */
router.get('/diff', async (req: Request, res: Response) => {
  const projectPath = (req.query.path as string) || (req.query.projectPath as string) || process.cwd();
  const commitHash = req.query.commit as string;

  if (!commitHash) {
    return res.status(400).json({ success: false, error: 'Commit hash is required' });
  }

  try {
    const { stdout: diffOutput } = await execAsync(`git diff ${commitHash}^!`, {
      cwd: projectPath,
    });
    const { stdout: statOutput } = await execAsync(`git show --stat --oneline ${commitHash}`, {
      cwd: projectPath,
    });

    const diff: CommitDiff = {
      commitHash,
      files: [],
      rawDiff: diffOutput || statOutput,
    };

    res.json({ success: true, diff });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/git/sync-status
 * Check GitHub connection, branch, local vs remote commits, ahead/behind
 */
router.get('/sync-status', async (req: Request, res: Response) => {
  const projectPath = (req.query.projectPath as string) || (req.query.path as string) || process.cwd();
  if (projectPath) setActiveWatchedProjectPath(projectPath);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({
      success: false,
      error: 'Project directory not found',
      isGit: false,
      connected: false,
      syncStatus: 'not_git',
      syncMessage: 'Direktori tidak ditemukan',
    });
  }

  // 1. Check if inside git worktree
  try {
    await execAsync('git rev-parse --is-inside-work-tree', { cwd: projectPath });
  } catch {
    return res.json({
      success: true,
      isGit: false,
      connected: false,
      repoName: '',
      repoUrl: '',
      currentBranch: '',
      branches: [],
      syncStatus: 'not_git',
      syncMessage: 'Bukan repositori Git',
      ahead: 0,
      behind: 0,
      localCommit: '',
      remoteCommit: null,
      lastSynced: 'Belum pernah',
    });
  }

  try {
    // 2. Current branch
    let currentBranch = 'main';
    try {
      const { stdout: bOut } = await execAsync('git branch --show-current', { cwd: projectPath });
      currentBranch = bOut.trim() || 'main';
    } catch {
      try {
        const { stdout: refOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectPath });
        currentBranch = refOut.trim() || 'main';
      } catch {}
    }

    // 3. Local branches
    let branches: string[] = [];
    try {
      const { stdout: brOut } = await execAsync('git branch --format="%(refname:short)"', { cwd: projectPath });
      branches = brOut
        .split('\n')
        .map((b) => b.trim())
        .filter((b) => b.length > 0);
    } catch {}
    if (branches.length === 0) branches = [currentBranch];

    // 4. Remote origin URL
    let rawRemoteUrl = '';
    try {
      const { stdout: rOut } = await execAsync('git config --get remote.origin.url', { cwd: projectPath });
      rawRemoteUrl = rOut.trim();
    } catch {
      try {
        const { stdout: rOut2 } = await execAsync('git remote get-url origin', { cwd: projectPath });
        rawRemoteUrl = rOut2.trim();
      } catch {}
    }

    if (!rawRemoteUrl) {
      return res.json({
        success: true,
        isGit: true,
        connected: false,
        repoName: '',
        repoUrl: '',
        cloneUrls: { https: '', ssh: '', cli: '' },
        currentBranch,
        branches,
        syncStatus: 'not_connected',
        syncMessage: 'Belum terhubung ke GitHub',
        ahead: 0,
        behind: 0,
        localCommit: '',
        remoteCommit: null,
        lastSynced: 'Belum pernah',
      });
    }

    const cleanRepoUrl = sanitizeRepoUrl(rawRemoteUrl);
    const repoName = extractRepoName(cleanRepoUrl) || path.basename(projectPath);

    // 5. Local commit HEAD
    let localCommit = '';
    try {
      const { stdout: hOut } = await execAsync('git rev-parse HEAD', { cwd: projectPath });
      localCommit = hOut.trim();
    } catch {}

    // 6. Remote commit via git ls-remote origin
    let remoteCommit: string | null = null;
    let syncStatus: 'in_sync' | 'behind' | 'ahead' | 'diverged' | 'offline' = 'in_sync';
    let syncMessage = 'In sync with GitHub';
    let ahead = 0;
    let behind = 0;

    try {
      // Try ls-remote for current branch
      let lsStdout = '';
      try {
        const { stdout } = await execAsync(
          `git ls-remote origin refs/heads/${currentBranch}`,
          { cwd: projectPath, timeout: 6000 }
        );
        lsStdout = stdout.trim();
      } catch {}

      if (!lsStdout) {
        // Fallback to ls-remote HEAD
        try {
          const { stdout } = await execAsync(
            `git ls-remote origin HEAD`,
            { cwd: projectPath, timeout: 6000 }
          );
          lsStdout = stdout.trim();
        } catch {}
      }

      if (lsStdout) {
        const parts = lsStdout.split(/[\t\s]+/);
        remoteCommit = parts[0]?.trim() || null;
      }

      if (remoteCommit) {
        if (localCommit && localCommit === remoteCommit) {
          syncStatus = 'in_sync';
          syncMessage = 'In sync with GitHub';
          ahead = 0;
          behind = 0;
        } else if (localCommit && remoteCommit) {
          // Compare ahead and behind
          try {
            const { stdout: bOut } = await execAsync(`git rev-list --count HEAD..${remoteCommit}`, {
              cwd: projectPath,
              timeout: 3000,
            });
            behind = parseInt(bOut.trim(), 10) || 0;
          } catch {}

          try {
            const { stdout: aOut } = await execAsync(`git rev-list --count ${remoteCommit}..HEAD`, {
              cwd: projectPath,
              timeout: 3000,
            });
            ahead = parseInt(aOut.trim(), 10) || 0;
          } catch {}

          if (ahead === 0 && behind > 0) {
            syncStatus = 'behind';
            syncMessage = `Behind by ${behind} commit${behind > 1 ? 's' : ''}`;
          } else if (ahead > 0 && behind === 0) {
            syncStatus = 'ahead';
            syncMessage = `Ahead by ${ahead} commit${ahead > 1 ? 's' : ''}`;
          } else if (ahead > 0 && behind > 0) {
            syncStatus = 'diverged';
            syncMessage = `Diverged: ${ahead} ahead, ${behind} behind`;
          } else {
            // Commit hashes differ but rev-list couldn't determine
            syncStatus = 'in_sync';
            syncMessage = 'In sync with GitHub';
          }
        }
      } else {
        // ls-remote returned empty (e.g. fresh repo or offline)
        syncStatus = 'in_sync';
        syncMessage = 'In sync with GitHub';
      }
    } catch (err: any) {
      console.warn('[Git sync-status] ls-remote check error/timeout:', err.message);
      syncStatus = 'in_sync';
      syncMessage = 'In sync with GitHub';
    }

    const now = new Date();
    const lastSynced = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} WIB`;

    // Persist in dynamic config
    saveGitConfigForProject(projectPath, {
      repoName,
      repoUrl: cleanRepoUrl,
      currentBranch,
      syncStatus,
      lastSynced,
    });

    const cloneUrls = {
      https: `https://github.com/${repoName}.git`,
      ssh: `git@github.com:${repoName}.git`,
      cli: `gh repo clone ${repoName}`,
    };

    res.json({
      success: true,
      isGit: true,
      connected: true,
      repoName,
      repoUrl: cleanRepoUrl.startsWith('http') ? cleanRepoUrl : `https://github.com/${repoName}`,
      cloneUrls,
      currentBranch,
      branches,
      syncStatus,
      syncMessage,
      localCommit: localCommit ? localCommit.slice(0, 7) : '',
      remoteCommit: remoteCommit ? remoteCommit.slice(0, 7) : null,
      ahead,
      behind,
      lastSynced,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
      isGit: true,
      connected: false,
      syncStatus: 'error',
      syncMessage: 'Gagal memeriksa status git',
    });
  }
});

/**
 * GET /api/git/download-zip
 * Stream a zip archive of the project excluding node_modules, .git, dist, etc.
 */
router.get('/download-zip', (req: Request, res: Response) => {
  const projectPath = (req.query.projectPath as string) || (req.query.path as string) || process.cwd();

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ success: false, error: 'Direktori proyek tidak ditemukan' });
  }

  const projectName = path.basename(projectPath) || 'source-code';
  const zipFileName = `${projectName}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

  const zip = spawn(
    'zip',
    [
      '-r',
      '-q',
      '-',
      '.',
      '-x',
      'node_modules/*',
      '.git/*',
      'dist/*',
      'client/dist/*',
      '.next/*',
      '.output/*',
      '.cache/*',
      '*.log',
    ],
    {
      cwd: projectPath,
    }
  );

  zip.stdout.pipe(res);

  zip.stderr.on('data', (data) => {
    console.error(`[Git Download ZIP] stderr: ${data}`);
  });

  zip.on('error', (err) => {
    console.error('[Git Download ZIP] spawn error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  req.on('close', () => {
    zip.kill();
  });
});

/**
 * POST /api/git/disconnect
 * Disconnect remote origin from local git repository
 */
router.post('/disconnect', async (req: Request, res: Response) => {
  const { projectPath = process.cwd() } = req.body;

  try {
    await execAsync('git remote remove origin', { cwd: projectPath });
    saveGitConfigForProject(projectPath, {
      repoName: '',
      repoUrl: '',
      connected: false,
      syncStatus: 'not_connected',
    });
    res.json({ success: true, message: 'Berhasil memutuskan koneksi GitHub' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/connect
 * Connect or update remote origin
 */
router.post('/connect', async (req: Request, res: Response) => {
  const { projectPath = process.cwd(), repoUrl } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ success: false, error: 'repoUrl is required' });
  }

  try {
    try {
      await execAsync(`git remote add origin ${repoUrl}`, { cwd: projectPath });
    } catch {
      await execAsync(`git remote set-url origin ${repoUrl}`, { cwd: projectPath });
    }

    const cleanUrl = sanitizeRepoUrl(repoUrl);
    const repoName = extractRepoName(cleanUrl);

    saveGitConfigForProject(projectPath, {
      repoName,
      repoUrl: cleanUrl,
      connected: true,
    });

    res.json({ success: true, message: 'Berhasil menghubungkan repositori GitHub', repoName });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/checkout-branch
 * Switch active branch
 */
router.post('/checkout-branch', async (req: Request, res: Response) => {
  const { projectPath = process.cwd(), branch } = req.body;

  if (!branch) {
    return res.status(400).json({ success: false, error: 'Branch is required' });
  }

  try {
    await execAsync(`git checkout ${branch}`, { cwd: projectPath });
    saveGitConfigForProject(projectPath, { currentBranch: branch });
    res.json({ success: true, currentBranch: branch, message: `Beralih ke cabang ${branch}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/sync-pull
 */
router.post('/sync-pull', async (req: Request, res: Response) => {
  const { projectPath = process.cwd(), branch } = req.body;
  const targetBranch = branch || 'main';

  try {
    const { stdout } = await execAsync(`git pull origin ${targetBranch}`, {
      cwd: projectPath,
      timeout: 15000,
    });
    res.json({ success: true, message: 'Berhasil menarik perubahan dari GitHub', output: stdout });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/sync-push
 */
router.post('/sync-push', async (req: Request, res: Response) => {
  const { projectPath = process.cwd(), branch } = req.body;
  const targetBranch = branch || 'main';

  try {
    const { stdout } = await execAsync(`git push origin ${targetBranch}`, {
      cwd: projectPath,
      timeout: 15000,
    });
    res.json({ success: true, message: 'Berhasil mengirim perubahan ke GitHub', output: stdout });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/preview
 */
router.post('/preview', async (req: Request, res: Response) => {
  const { projectPath = process.cwd(), commitHash } = req.body;
  if (!commitHash) {
    return res.status(400).json({ success: false, error: 'commitHash is required' });
  }

  try {
    await execAsync(`git checkout ${commitHash}`, { cwd: projectPath });
    res.json({ success: true, message: `Switched preview to ${commitHash}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/revert
 */
router.post('/revert', async (req: Request, res: Response) => {
  const { projectPath = process.cwd(), commitHash } = req.body;
  if (!commitHash) {
    return res.status(400).json({ success: false, error: 'commitHash is required' });
  }

  try {
    await execAsync(`git revert --no-edit ${commitHash}`, { cwd: projectPath });
    res.json({ success: true, message: `Reverted commit ${commitHash}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
