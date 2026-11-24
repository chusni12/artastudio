import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, execFileSync, spawn } from 'node:child_process';
import type { RepoProject, RepoBranch, GitCloneProgress } from '../../shared/types';
import { broadcastWebSocketEvent } from '../ws';

const router = Router();

function parseGitProgressLine(
  line: string,
  context?: { lastTotalMb?: string; lastSpeed?: string }
): Omit<GitCloneProgress, 'targetPath'> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 1. Receiving objects:  45% (17017/37817), 162.77 MiB | 9.56 MiB/s
  // Also Indonesian: Menerima objek:  45% (17017/37817), 162.77 MiB | 9.56 MiB/s
  const rxReceiving = /(?:Receiving objects|Menerima objek):\s+(\d+)%(?:[^(]*\([^)]+\))?(?:,\s*([\d.]+\s*[KMGT]?i?B))?(?:\s*\|\s*([\d.]+\s*[KMGT]?i?B\/s))?/i;
  let match = trimmed.match(rxReceiving);
  if (match) {
    const percent = parseInt(match[1], 10);
    const size = match[2] || context?.lastTotalMb || '';
    const speed = match[3] || context?.lastSpeed || '';
    let text = `Mengunduh objek: ${percent}%`;
    if (size) {
      text += ` (${size}${speed ? ' • ' + speed : ''})`;
    }
    return {
      stage: 'receiving',
      percent,
      totalMb: size,
      speed,
      size,
      text,
    };
  }

  // 2. Resolving deltas:  80% (21888/27361)
  // Also Indonesian: Menyelesaikan delta:  80%
  const rxResolving = /(?:Resolving deltas|Menyelesaikan delta):\s+(\d+)%/i;
  match = trimmed.match(rxResolving);
  if (match) {
    const percent = parseInt(match[1], 10);
    return {
      stage: 'resolving',
      percent,
      totalMb: context?.lastTotalMb || '',
      speed: context?.lastSpeed || '',
      size: context?.lastTotalMb || '',
      text: `Menyelesaikan delta: ${percent}%`,
    };
  }

  // 3. Updating files:  90% (500/555)
  // Also Indonesian: Memperbarui berkas: 90%
  const rxUpdating = /(?:Updating files|Memperbarui berkas):\s+(\d+)%/i;
  match = trimmed.match(rxUpdating);
  if (match) {
    const percent = parseInt(match[1], 10);
    return {
      stage: 'updating',
      percent,
      totalMb: context?.lastTotalMb || '',
      speed: context?.lastSpeed || '',
      size: context?.lastTotalMb || '',
      text: `Menyiapkan berkas: ${percent}%`,
    };
  }

  // 4. Compressing objects: 80% (16/20)
  const rxCompressing = /(?:Compressing objects|Mengompresi objek):\s+(\d+)%/i;
  match = trimmed.match(rxCompressing);
  if (match) {
    const percent = parseInt(match[1], 10);
    return {
      stage: 'compressing',
      percent,
      totalMb: context?.lastTotalMb || '',
      speed: context?.lastSpeed || '',
      size: context?.lastTotalMb || '',
      text: `Mengompres objek: ${percent}%`,
    };
  }

  // 5. Counting / Enumerating objects: 50%
  const rxCounting = /(?:Counting objects|Menghitung objek):\s+(\d+)%/i;
  match = trimmed.match(rxCounting);
  if (match) {
    const percent = parseInt(match[1], 10);
    return {
      stage: 'counting',
      percent,
      totalMb: '',
      speed: '',
      size: '',
      text: `Menghitung objek: ${percent}%`,
    };
  }

  // 6. Cloning into '...'
  if (/^Cloning into|^Kloning ke/i.test(trimmed)) {
    return {
      stage: 'cloning',
      percent: 0,
      totalMb: '',
      speed: '',
      size: '',
      text: 'Menghubungkan ke repositori...',
    };
  }

  return null;
}

function getGitRemoteUrl(dirPath: string): string {
  try {
    const url = execSync('git config --get remote.origin.url', {
      cwd: dirPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return url ? url.replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/') : '';
  } catch {
    return '';
  }
}

function getGitBranch(dirPath: string): string {
  try {
    const branch = execSync('git branch --show-current', {
      cwd: dirPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (branch) return branch;
  } catch {}
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: dirPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (branch && branch !== 'HEAD') return branch;
  } catch {}
  return path.basename(dirPath);
}

function findPackageJsonRecursive(dir: string, maxDepth: number = 2): string | null {
  const direct = path.join(dir, 'package.json');
  if (fs.existsSync(direct)) return direct;
  if (maxDepth <= 0) return null;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const sub = path.join(dir, entry.name, 'package.json');
        if (fs.existsSync(sub)) return sub;
      }
    }
  } catch {}
  return null;
}

function detectFramework(pkgPath: string | null): string {
  try {
    if (!pkgPath || !fs.existsSync(pkgPath)) return 'unknown';
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['@tanstack/react-start']) return 'TanStack Start';
    if (deps['next']) return 'Next.js';
    if (deps['vite']) return 'Vite + React';
    if (deps['react']) return 'React';
    if (deps['vue']) return 'Vue';
    if (deps['svelte']) return 'Svelte';
    return 'Node.js';
  } catch {
    return 'unknown';
  }
}

function formatProjectName(rawName: string, repoUrl?: string): string {
  const lower = rawName.toLowerCase();
  if (lower === 'artaloka') return 'ArtaLoka';
  if (lower === 'artastudio') return 'ArtaStudio';
  if (lower === 'tahqiq') return 'Tahqiq';

  if (repoUrl) {
    const match = repoUrl.match(/\/([^/]+?)(?:\.git)?$/);
    if (match) {
      const base = match[1].toLowerCase();
      if (base.startsWith('artaloka')) return 'ArtaLoka';
      if (base.startsWith('tahqiq')) return 'Tahqiq';
      if (base.startsWith('artastudio')) return 'ArtaStudio';
    }
  }

  return rawName
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const customProjectsFile = path.join(process.cwd(), 'projects.json');
const removedProjectsFile = path.join(process.cwd(), 'removed_projects.json');

function loadCustomProjects(): string[] {
  if (fs.existsSync(customProjectsFile)) {
    try {
      return JSON.parse(fs.readFileSync(customProjectsFile, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

function saveCustomProjects(paths: string[]) {
  try {
    fs.writeFileSync(customProjectsFile, JSON.stringify(paths, null, 2), 'utf-8');
  } catch {}
}

function loadRemovedProjects(): string[] {
  if (fs.existsSync(removedProjectsFile)) {
    try {
      return JSON.parse(fs.readFileSync(removedProjectsFile, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

function saveRemovedProjects(paths: string[]) {
  try {
    fs.writeFileSync(removedProjectsFile, JSON.stringify(paths, null, 2), 'utf-8');
  } catch {}
}

router.get('/', (req: Request, res: Response) => {
  const isWindows = process.platform === 'win32';
  const defaultRoot = path.join(os.homedir(), 'artastudio-workspaces');
  const rootWorkspaces = process.env.WORKSPACES_ROOT || (fs.existsSync('/home/chusni/orca/workspaces') ? '/home/chusni/orca/workspaces' : defaultRoot);
  const currentPath = process.cwd();
  const repos: RepoProject[] = [];

  const scannedPaths = new Set<string>();
  const removedList = loadRemovedProjects().map(p => path.resolve(p));

  // 1. Scan default workspaces directory
  try {
    if (fs.existsSync(rootWorkspaces)) {
      const topEntries = fs.readdirSync(rootWorkspaces, { withFileTypes: true });

      for (const top of topEntries) {
        if (!top.isDirectory() || top.name.startsWith('.')) continue;
        const orgPath = path.join(rootWorkspaces, top.name);
        scannedPaths.add(orgPath);
        const subEntries = fs.readdirSync(orgPath, { withFileTypes: true });

        const branches: RepoBranch[] = [];
        let repoUrl = '';

        for (const sub of subEntries) {
          if (!sub.isDirectory() || sub.name.startsWith('.')) continue;
          const subPath = path.join(orgPath, sub.name);
          const hasGit = fs.existsSync(path.join(subPath, '.git'));
          const foundPkg = findPackageJsonRecursive(subPath);

          if (hasGit || foundPkg) {
            const url = getGitRemoteUrl(subPath);
            if (url && !repoUrl) repoUrl = url;
            const bName = getGitBranch(subPath);
            const isCurrent = subPath === currentPath;

            branches.push({
              name: bName,
              path: subPath,
              isCurrent,
            });
          }
        }

        if (branches.length > 0) {
          branches.sort((a, b) => {
            // Prioritaskan cabang 'main' agar selalu standar seperti Lovable
            if (a.name === 'main') return -1;
            if (b.name === 'main') return 1;
            if (a.name === 'master') return -1;
            if (b.name === 'master') return 1;
            if (a.name === 'bowhead') return -1;
            if (b.name === 'bowhead') return 1;
            if (a.isCurrent) return -1;
            if (b.isCurrent) return 1;
            return a.name.localeCompare(b.name);
          });

          // Default selalu cabang 'main' jika tersedia (standar Lovable)
          const defaultBranch =
            branches.find((b) => b.name === 'main') ||
            branches.find((b) => b.name === 'master') ||
            branches.find((b) => b.name === 'bowhead') ||
            branches[0];
          const defaultPath = defaultBranch ? defaultBranch.path : orgPath;
          const framework = detectFramework(findPackageJsonRecursive(defaultPath));

          // Pastikan tidak masuk daftar yang disembunyikan/dihapus user
          if (!removedList.includes(path.resolve(defaultPath)) && !removedList.includes(path.resolve(orgPath))) {
            repos.push({
              id: top.name,
              name: formatProjectName(top.name, repoUrl),
              repoUrl: repoUrl || `https://github.com/chusni12/${top.name}.git`,
              defaultPath,
              framework,
              branches,
            });
          }
        } else {
          // Top-level direct project (e.g. artastudio)
          const hasGit = fs.existsSync(path.join(orgPath, '.git'));
          const foundPkg = findPackageJsonRecursive(orgPath);
          if (hasGit || foundPkg) {
            const url = getGitRemoteUrl(orgPath);
            const bName = getGitBranch(orgPath);
            const isCurrent = orgPath === currentPath;

            if (!removedList.includes(path.resolve(orgPath))) {
              repos.push({
                id: top.name,
                name: formatProjectName(top.name, url),
                repoUrl: url || `https://github.com/chusni12/${top.name}.git`,
                defaultPath: orgPath,
                framework: detectFramework(foundPkg),
                branches: [{ name: bName, path: orgPath, isCurrent }],
              });
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.error('[Workspaces] Scan error:', err);
  }

  // 2. Scan custom user projects from projects.json
  const customProjects = loadCustomProjects();
  for (const cPath of customProjects) {
    if (fs.existsSync(cPath) && !scannedPaths.has(cPath) && !removedList.includes(path.resolve(cPath))) {
      scannedPaths.add(cPath);
      const cName = path.basename(cPath);
      const url = getGitRemoteUrl(cPath);
      const bName = getGitBranch(cPath);
      const foundPkg = findPackageJsonRecursive(cPath);
      const isCurrent = cPath === currentPath;

      if (!repos.some((r) => r.defaultPath === cPath || r.branches.some((b) => b.path === cPath))) {
        repos.push({
          id: `custom/${cName}`,
          name: formatProjectName(cName, url),
          repoUrl: url || `Local: ${cPath}`,
          defaultPath: cPath,
          framework: detectFramework(foundPkg),
          branches: [{ name: bName, path: cPath, isCurrent }],
        });
      }
    }
  }

  // 3. Ensure current working directory project is included if not hidden
  const hasCurrentInBranches = repos.some((r) => r.branches.some((b) => b.isCurrent || b.path === currentPath));
  if (!hasCurrentInBranches && !removedList.includes(path.resolve(currentPath))) {
    const currentName = path.basename(currentPath);
    const url = getGitRemoteUrl(currentPath);
    const bName = getGitBranch(currentPath);
    const foundPkg = findPackageJsonRecursive(currentPath);

    repos.unshift({
      id: `current/${currentName}`,
      name: formatProjectName(currentName, url),
      repoUrl: url || `https://github.com/chusni12/${currentName}.git`,
      defaultPath: currentPath,
      framework: detectFramework(foundPkg),
      branches: [{ name: bName, path: currentPath, isCurrent: true }],
    });
  }

  res.json({ success: true, count: repos.length, workspaces: repos, repos });
});

router.get('/seo-status', (req: Request, res: Response) => {
  const targetPath = (req.query.projectPath as string) || process.cwd();
  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ success: false, error: 'Target directory not found' });
  }

  // Check robots.txt in possible locations
  const robotsCandidates = [
    path.join(targetPath, 'public', 'robots.txt'),
    path.join(targetPath, 'client', 'public', 'robots.txt'),
    path.join(targetPath, '.output', 'public', 'robots.txt'),
    path.join(targetPath, 'robots.txt'),
  ];
  let robotsFile: string | null = null;
  let robotsPreview = '';
  for (const cand of robotsCandidates) {
    if (fs.existsSync(cand)) {
      robotsFile = cand;
      try {
        robotsPreview = fs.readFileSync(cand, 'utf-8').slice(0, 300);
      } catch {}
      break;
    }
  }

  // Check sitemap in possible locations
  const sitemapCandidates = [
    { p: path.join(targetPath, 'public', 'sitemap.xml'), type: 'static' },
    { p: path.join(targetPath, 'src', 'routes', 'sitemap[.]xml.ts'), type: 'dynamic' },
    { p: path.join(targetPath, 'src', 'routes', 'sitemap.xml.ts'), type: 'dynamic' },
    { p: path.join(targetPath, 'src', 'lib', 'seo', 'sitemapGenerator.ts'), type: 'generator' },
    { p: path.join(targetPath, 'src', 'lib', 'sitemap.ts'), type: 'generator' },
    { p: path.join(targetPath, '.output', 'public', 'sitemap.xml'), type: 'static' },
    { p: path.join(targetPath, 'sitemap.xml'), type: 'static' },
  ];
  let sitemapFile: string | null = null;
  let sitemapType = '';
  for (const cand of sitemapCandidates) {
    if (fs.existsSync(cand.p)) {
      sitemapFile = cand.p;
      sitemapType = cand.type;
      break;
    }
  }

  // Check HTML / metadata basics
  let hasMeta = false;
  let pageTitle = '';
  const htmlCandidates = [
    path.join(targetPath, 'index.html'),
    path.join(targetPath, 'client', 'index.html'),
    path.join(targetPath, 'src', 'routes', '__root.tsx'),
  ];
  for (const cand of htmlCandidates) {
    if (fs.existsSync(cand)) {
      try {
        const content = fs.readFileSync(cand, 'utf-8');
        if (content.includes('<title>') || content.includes('title:') || content.includes('meta')) {
          hasMeta = true;
          const match = content.match(/<title>([^<]+)<\/title>/);
          if (match) pageTitle = match[1];
        }
      } catch {}
      break;
    }
  }

  return res.json({
    success: true,
    projectPath: targetPath,
    hasRobots: !!robotsFile,
    robotsRelPath: robotsFile ? path.relative(targetPath, robotsFile) : null,
    robotsPreview,
    hasSitemap: !!sitemapFile,
    sitemapRelPath: sitemapFile ? path.relative(targetPath, sitemapFile) : null,
    sitemapType,
    hasMeta,
    pageTitle,
    ssrReady: fs.existsSync(path.join(targetPath, 'src', 'routes')) || fs.existsSync(path.join(targetPath, 'app')),
  });
});

function getGitHubCredentials(): { token?: string; user?: string } {
  // 1. Dari Environment Variables
  if (process.env.GITHUB_TOKEN) {
    return { token: process.env.GITHUB_TOKEN };
  }
  if (process.env.GH_TOKEN) {
    return { token: process.env.GH_TOKEN };
  }

  // 2. Dari ~/.git-credentials
  try {
    const credPath = path.join(os.homedir(), '.git-credentials');
    if (fs.existsSync(credPath)) {
      const content = fs.readFileSync(credPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^https:\/\/(?:([^:]+):)?([^@]+)@github\.com/);
        if (match) {
          return {
            user: match[1] || undefined,
            token: match[2],
          };
        }
      }
    }
  } catch {}

  // 3. Dari GitHub CLI (gh auth token) jika terpasang
  try {
    const ghToken = execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' }).trim();
    if (ghToken) {
      return { token: ghToken };
    }
  } catch {}

  return {};
}

function resolveGitCloneAuth(rawUrl: string): { cloneUrl: string; maskedUrl: string; hasToken: boolean } {
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('https://github.com/')) {
    return { cloneUrl: trimmed, maskedUrl: trimmed, hasToken: false };
  }

  // Jika URL sudah mengandung token / kredensial
  if (trimmed.includes('@')) {
    const masked = trimmed.replace(/https:\/\/[^@]+@/, 'https://***@');
    return { cloneUrl: trimmed, maskedUrl: masked, hasToken: true };
  }

  const { token, user } = getGitHubCredentials();
  if (token) {
    const authPart = user ? `${encodeURIComponent(user)}:${encodeURIComponent(token)}` : encodeURIComponent(token);
    const cloneUrl = trimmed.replace('https://github.com/', `https://${authPart}@github.com/`);
    const maskedUrl = trimmed.replace('https://github.com/', 'https://***@github.com/');
    return { cloneUrl, maskedUrl, hasToken: true };
  }

  return { cloneUrl: trimmed, maskedUrl: trimmed, hasToken: false };
}

/**
 * GET /api/workspaces/github-repos
 * Ambil daftar repositori akun GitHub lokal dengan token/credentials
 */
router.get('/github-repos', async (req: Request, res: Response) => {
  try {
    let token = (req.query.token as string) || (req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    let username: string | undefined;

    if (!token) {
      const creds = getGitHubCredentials();
      token = creds.token;
      username = creds.user;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Kredensial GitHub tidak ditemukan di sistem (~/.git-credentials atau gh auth token)',
        authenticated: false,
        repos: [],
      });
    }

    // 1. Dapatkan profil user untuk info avatar & username
    let userProfile = { login: username || '', name: '', avatarUrl: '' };
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ArtaStudio-App',
        },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        userProfile = {
          login: userData.login || username || '',
          name: userData.name || userData.login || '',
          avatarUrl: userData.avatar_url || '',
        };
      }
    } catch (e: any) {
      console.warn('[GitHub Repos] Gagal mengambil profil user:', e.message);
    }

    // 2. Fetch repositori user (per_page=100, sort=updated, semua affiliation: owner & collaborator)
    const reposRes = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ArtaStudio-App',
        },
      }
    );

    if (!reposRes.ok) {
      const errText = await reposRes.text();
      return res.status(reposRes.status).json({
        success: false,
        error: `GitHub API error (${reposRes.status}): ${errText}`,
        authenticated: false,
        repos: [],
      });
    }

    const reposData = await reposRes.json();
    if (!Array.isArray(reposData)) {
      return res.status(500).json({
        success: false,
        error: 'Respons dari GitHub tidak berupa daftar repositori',
        repos: [],
      });
    }

    const repos = reposData.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: Boolean(repo.private),
      cloneUrl: repo.clone_url || `https://github.com/${repo.full_name}.git`,
      htmlUrl: repo.html_url,
      description: repo.description || '',
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
      defaultBranch: repo.default_branch || 'main',
      language: repo.language || null,
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
    }));

    return res.json({
      success: true,
      authenticated: true,
      user: userProfile,
      count: repos.length,
      repos,
    });
  } catch (err: any) {
    console.error('[GitHub Repos] Error fetching repos:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Gagal mengambil repositori GitHub',
      repos: [],
    });
  }
});

router.post('/add', async (req: Request, res: Response) => {
  const { mode, localPath, gitUrl, folderName } = req.body || {};

  try {
    if (mode === 'local') {
      const rawPath = (localPath || '').trim().replace(/^["']|["']$/g, '').trim();
      const absPath = path.resolve(rawPath);

      if (!rawPath || !fs.existsSync(absPath)) {
        return res.status(400).json({ success: false, error: `Direktori folder lokal tidak ditemukan di sistem: ${rawPath}` });
      }
      
      // Hapus dari daftar removed jika sebelumnya pernah disembunyikan
      const removed = loadRemovedProjects().filter(p => path.resolve(p) !== absPath);
      saveRemovedProjects(removed);

      const custom = loadCustomProjects();
      if (!custom.includes(absPath)) {
        custom.push(absPath);
        saveCustomProjects(custom);
      }
      return res.json({ success: true, message: 'Proyek berhasil ditautkan!', path: absPath });
    }

    if (mode === 'clone') {
      if (!gitUrl || (!gitUrl.startsWith('http') && !gitUrl.startsWith('file://') && !gitUrl.startsWith('git@'))) {
        return res.status(400).json({ success: false, error: 'URL Git tidak valid' });
      }

      const isWindows = process.platform === 'win32';
      const defaultRoot = path.join(os.homedir(), 'artastudio-workspaces');
      const rootWorkspaces = process.env.WORKSPACES_ROOT || (fs.existsSync('/home/chusni/orca/workspaces') ? '/home/chusni/orca/workspaces' : defaultRoot);

      if (!fs.existsSync(rootWorkspaces)) {
        fs.mkdirSync(rootWorkspaces, { recursive: true });
      }

      let dirName = folderName ? folderName.trim() : '';
      if (!dirName) {
        const match = gitUrl.match(/\/([^/]+?)(?:\.git)?$/);
        dirName = match ? match[1] : `project_${Date.now()}`;
      }

      // Sanitasi folder name: spasi (seperti "web les") di-normalize menjadi "web-les"
      // dan bersihkan karakter berbahaya/terlarang untuk path sistem
      dirName = dirName
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '');

      const targetPath = path.join(rootWorkspaces, dirName);
      if (fs.existsSync(targetPath)) {
        return res.status(400).json({ success: false, error: `Folder target ${dirName} sudah ada!` });
      }

      const isSse = req.headers.accept?.includes('text/event-stream') || req.body?.stream === true || req.query?.stream === 'true';

      if (isSse) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        if (typeof res.flushHeaders === 'function') {
          res.flushHeaders();
        }
      }

      const sendEvent = (payload: GitCloneProgress) => {
        try {
          broadcastWebSocketEvent('workspaces', 'clone:progress', payload);
        } catch {}

        if (isSse && !res.writableEnded) {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        }
      };

      // Initial progress
      sendEvent({
        stage: 'cloning',
        percent: 0,
        text: 'Menghubungkan ke repositori Git...',
        targetPath,
      });

      const { cloneUrl } = resolveGitCloneAuth(gitUrl);

      // Gunakan credential.helper=store agar git dapat membaca ~/.git-credentials
      // Dan GIT_TERMINAL_PROMPT=0 agar proses tidak hang jika auth gagal
      const gitArgs = [
        '-c', 'credential.helper=store',
        'clone',
        '--progress',
        cloneUrl,
        targetPath,
      ];

      const gitProcess = spawn('git', gitArgs, {
        env: {
          ...process.env,
          LC_ALL: 'C',
          GIT_TERMINAL_PROMPT: '0',
        },
      });

      const sanitizeLog = (str: string) => str.replace(/https:\/\/[^@]+@github\.com/g, 'https://github.com');

      let stderrBuffer = '';
      let rawError = '';

      gitProcess.stderr.on('data', (chunk: Buffer) => {
        const str = sanitizeLog(chunk.toString('utf-8'));
        rawError += str;
        const text = stderrBuffer + str;
        const lines = text.split(/[\r\n]+/);
        stderrBuffer = lines.pop() || '';

        for (const line of lines) {
          const parsed = parseGitProgressLine(line);
          if (parsed) {
            sendEvent({ ...parsed, targetPath });
          }
        }
      });

      gitProcess.stdout.on('data', (chunk: Buffer) => {
        const str = sanitizeLog(chunk.toString('utf-8'));
        const lines = str.split(/[\r\n]+/);
        for (const line of lines) {
          const parsed = parseGitProgressLine(line);
          if (parsed) {
            sendEvent({ ...parsed, targetPath });
          }
        }
      });

      gitProcess.on('error', (err) => {
        if (fs.existsSync(targetPath)) {
          try { fs.rmSync(targetPath, { recursive: true, force: true }); } catch {}
        }
        sendEvent({
          stage: 'error',
          percent: 0,
          text: `Gagal menjalankan git: ${err.message}`,
          error: err.message,
          success: false,
          targetPath,
        });
        if (isSse) {
          res.end();
        } else {
          res.status(500).json({ success: false, error: err.message });
        }
      });

      gitProcess.on('close', (code) => {
        if (stderrBuffer.trim()) {
          const parsed = parseGitProgressLine(stderrBuffer);
          if (parsed) {
            sendEvent({ ...parsed, targetPath });
          }
        }

        if (code !== 0) {
          if (fs.existsSync(targetPath)) {
            try { fs.rmSync(targetPath, { recursive: true, force: true }); } catch {}
          }
          const cleanErr = sanitizeLog(
            rawError
              .split('\n')
              .filter((l) => l.includes('fatal:') || l.includes('error:'))
              .join(' ') ||
              rawError.slice(-200) ||
              `Git clone gagal dengan kode keluar ${code}`
          );
          sendEvent({
            stage: 'error',
            percent: 0,
            text: cleanErr,
            error: cleanErr,
            success: false,
            targetPath,
          });
          if (isSse) {
            res.end();
          } else {
            res.status(500).json({ success: false, error: cleanErr });
          }
          return;
        }

        // Hapus dari daftar removed jika sebelumnya pernah dihapus
        const removed = loadRemovedProjects().filter((p) => path.resolve(p) !== path.resolve(targetPath));
        saveRemovedProjects(removed);

        const custom = loadCustomProjects();
        if (!custom.includes(targetPath)) {
          custom.push(targetPath);
          saveCustomProjects(custom);
        }

        sendEvent({
          stage: 'done',
          percent: 100,
          text: '100% Selesai!',
          success: true,
          targetPath,
        });

        if (isSse) {
          res.end();
        } else {
          res.json({ success: true, message: 'Clone berhasil!', path: targetPath });
        }
      });

      return;
    }

    return res.status(400).json({ success: false, error: 'Mode tidak didukung' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Gagal menambahkan proyek' });
  }
});

router.post('/remove', async (req: Request, res: Response) => {
  const { projectPath } = req.body || {};
  if (!projectPath) {
    return res.status(400).json({ success: false, error: 'projectPath wajib diisi' });
  }

  try {
    const absPath = path.resolve(projectPath);

    // 1. Hapus dari custom projects
    const custom = loadCustomProjects();
    const updatedCustom = custom.filter((p) => path.resolve(p) !== absPath);
    saveCustomProjects(updatedCustom);

    // 2. Tambahkan ke removed projects list agar tidak di-scan ulang otomatis
    const removed = loadRemovedProjects();
    if (!removed.map(p => path.resolve(p)).includes(absPath)) {
      removed.push(absPath);
      saveRemovedProjects(removed);
    }

    return res.json({ success: true, message: 'Proyek berhasil dilepas dari daftar' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
