import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, execFileSync } from 'node:child_process';
import type { RepoProject, RepoBranch } from '../../shared/types';

const router = Router();

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
  const defaultRoot = isWindows ? path.join(os.homedir(), 'artastudio-workspaces') : '/home/chusni/orca/workspaces';
  const rootWorkspaces = process.env.WORKSPACES_ROOT || defaultRoot;
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

router.post('/add', async (req: Request, res: Response) => {
  const { mode, localPath, gitUrl, folderName } = req.body || {};

  try {
    if (mode === 'local') {
      if (!localPath || !fs.existsSync(localPath)) {
        return res.status(400).json({ success: false, error: 'Direktori folder lokal tidak ditemukan di sistem' });
      }
      const absPath = path.resolve(localPath);
      
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
      if (!gitUrl || !gitUrl.startsWith('http')) {
        return res.status(400).json({ success: false, error: 'URL Git tidak valid' });
      }

      const isWindows = process.platform === 'win32';
      const defaultRoot = isWindows ? path.join(os.homedir(), 'artastudio-workspaces') : '/home/chusni/orca/workspaces';
      const rootWorkspaces = process.env.WORKSPACES_ROOT || defaultRoot;

      if (!fs.existsSync(rootWorkspaces)) {
        fs.mkdirSync(rootWorkspaces, { recursive: true });
      }

      let dirName = folderName;
      if (!dirName) {
        const match = gitUrl.match(/\/([^/]+?)(?:\.git)?$/);
        dirName = match ? match[1] : `project_${Date.now()}`;
      }

      const targetPath = path.join(rootWorkspaces, dirName);
      if (fs.existsSync(targetPath)) {
        return res.status(400).json({ success: false, error: `Folder target ${dirName} sudah ada!` });
      }

      execFileSync('git', ['clone', gitUrl, targetPath], { stdio: 'inherit' });

      // Hapus dari daftar removed jika sebelumnya pernah dihapus
      const removed = loadRemovedProjects().filter(p => path.resolve(p) !== path.resolve(targetPath));
      saveRemovedProjects(removed);

      const custom = loadCustomProjects();
      if (!custom.includes(targetPath)) {
        custom.push(targetPath);
        saveCustomProjects(custom);
      }

      return res.json({ success: true, message: 'Clone berhasil!', path: targetPath });
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
