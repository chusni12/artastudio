import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { RepoProject, RepoBranch } from '../../shared/types';

const router = Router();

function getGitRemoteUrl(dirPath: string): string {
  try {
    return execSync('git config --get remote.origin.url', {
      cwd: dirPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
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

function detectFramework(pkgPath: string): string {
  try {
    if (!fs.existsSync(pkgPath)) return 'unknown';
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

router.get('/', (req: Request, res: Response) => {
  const rootWorkspaces = '/home/chusni/orca/workspaces';
  const currentPath = process.cwd();
  const repos: RepoProject[] = [];

  try {
    if (fs.existsSync(rootWorkspaces)) {
      const topEntries = fs.readdirSync(rootWorkspaces, { withFileTypes: true });

      for (const top of topEntries) {
        if (!top.isDirectory() || top.name.startsWith('.')) continue;
        const orgPath = path.join(rootWorkspaces, top.name);
        const subEntries = fs.readdirSync(orgPath, { withFileTypes: true });

        const branches: RepoBranch[] = [];
        let repoUrl = '';

        for (const sub of subEntries) {
          if (!sub.isDirectory() || sub.name.startsWith('.')) continue;
          const subPath = path.join(orgPath, sub.name);
          const hasGit = fs.existsSync(path.join(subPath, '.git'));
          const pkgPath = path.join(subPath, 'package.json');

          if (hasGit || fs.existsSync(pkgPath)) {
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
          // Sort branches: current first, then bowhead, then main/master, then alphabetical
          branches.sort((a, b) => {
            if (a.isCurrent) return -1;
            if (b.isCurrent) return 1;
            if (a.name === 'bowhead') return -1;
            if (b.name === 'bowhead') return 1;
            if (a.name === 'main' || a.name === 'master') return -1;
            if (b.name === 'main' || b.name === 'master') return 1;
            return a.name.localeCompare(b.name);
          });

          // Preferred default path: bowhead, or isCurrent, or first branch
          const defaultBranch =
            branches.find((b) => b.name === 'bowhead') ||
            branches.find((b) => b.isCurrent) ||
            branches[0];
          const defaultPath = defaultBranch ? defaultBranch.path : orgPath;
          const framework = detectFramework(path.join(defaultPath, 'package.json'));

          repos.push({
            id: top.name,
            name: formatProjectName(top.name, repoUrl),
            repoUrl: repoUrl || `https://github.com/chusni12/${top.name}.git`,
            defaultPath,
            framework,
            branches,
          });
        } else {
          // Top-level direct project (e.g. artastudio)
          const hasGit = fs.existsSync(path.join(orgPath, '.git'));
          const pkgPath = path.join(orgPath, 'package.json');
          if (hasGit || fs.existsSync(pkgPath)) {
            const url = getGitRemoteUrl(orgPath);
            const bName = getGitBranch(orgPath);
            const isCurrent = orgPath === currentPath;

            repos.push({
              id: top.name,
              name: formatProjectName(top.name, url),
              repoUrl: url || `https://github.com/chusni12/${top.name}.git`,
              defaultPath: orgPath,
              framework: detectFramework(pkgPath),
              branches: [{ name: bName, path: orgPath, isCurrent }],
            });
          }
        }
      }
    }
  } catch (err: any) {
    console.error('[Workspaces] Scan error:', err);
  }

  // Ensure current project is included if not found
  const hasCurrentInBranches = repos.some((r) => r.branches.some((b) => b.isCurrent || b.path === currentPath));
  if (!hasCurrentInBranches) {
    const currentName = path.basename(currentPath);
    const url = getGitRemoteUrl(currentPath);
    const bName = getGitBranch(currentPath);
    const pkgPath = path.join(currentPath, 'package.json');

    repos.unshift({
      id: `current/${currentName}`,
      name: formatProjectName(currentName, url),
      repoUrl: url || `https://github.com/chusni12/${currentName}.git`,
      defaultPath: currentPath,
      framework: detectFramework(pkgPath),
      branches: [{ name: bName, path: currentPath, isCurrent: true }],
    });
  }

  res.json({ success: true, count: repos.length, workspaces: repos, repos });
});

router.get('/current', (req: Request, res: Response) => {
  const currentPath = process.cwd();
  const currentName = path.basename(currentPath);
  const pkgPath = path.join(currentPath, 'package.json');
  const url = getGitRemoteUrl(currentPath);
  const bName = getGitBranch(currentPath);

  const currentRepo: RepoProject = {
    id: `current/${currentName}`,
    name: formatProjectName(currentName, url),
    repoUrl: url || `https://github.com/chusni12/${currentName}.git`,
    defaultPath: currentPath,
    framework: detectFramework(pkgPath),
    branches: [{ name: bName, path: currentPath, isCurrent: true }],
  };

  res.json({ success: true, workspace: currentRepo, repo: currentRepo });
});


const customProjectsFile = path.join(process.cwd(), 'projects.json');

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

router.post('/add', async (req: Request, res: Response) => {
  const { mode, localPath, gitUrl, folderName } = req.body || {};

  try {
    if (mode === 'local') {
      if (!localPath || !fs.existsSync(localPath)) {
        return res.status(400).json({ success: false, error: 'Direktori folder lokal tidak ditemukan di sistem' });
      }
      const absPath = path.resolve(localPath);
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

      const rootWorkspaces = '/home/chusni/orca/workspaces';
      let dirName = folderName;
      if (!dirName) {
        const match = gitUrl.match(/\/([^/]+?)(?:\.git)?$/);
        dirName = match ? match[1] : `project_${Date.now()}`;
      }

      const targetPath = path.join(rootWorkspaces, dirName);
      if (fs.existsSync(targetPath)) {
        return res.status(400).json({ success: false, error: `Folder target ${dirName} sudah ada di workspaces!` });
      }

      execSync(`git clone ${gitUrl} "${targetPath}"`, { stdio: 'inherit' });

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

export default router;
