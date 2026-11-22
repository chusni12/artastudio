/**
 * ArtaStudio - Workspace Discovery Service
 * Scans directories, identifies projects, git repositories, frameworks, scripts, and dev server ports.
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { execSync } from 'node:child_process';
import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  ProjectInfo,
  ProjectDetail,
  ProjectPackageJson,
  ProjectStatus,
  WorkspaceScanOptions,
} from '../../shared/types.js';

export const COMMON_DEV_PORTS = [5173, 5199, 3000, 8080];
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.cache',
  '.agent',
  '.orca-preparing',
  '.hermes',
  'coverage',
  'tmp',
  'temp',
  'raw_banners',
]);

/**
 * Checks if a TCP port is active and accepting connections on localhost.
 */
export function isPortActive(port: number, timeoutMs = 250): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    try {
      socket.connect(port, '127.0.0.1');
    } catch {
      resolve(false);
    }
  });
}

/**
 * Detects git status, current branch, worktree status, and remote URL.
 */
export async function detectGitInfo(projectPath: string): Promise<{
  hasGit: boolean;
  currentBranch?: string;
  isWorktree?: boolean;
  remoteUrl?: string;
}> {
  const gitPath = path.join(projectPath, '.git');
  let hasGit = false;
  let isWorktree = false;
  let currentBranch: string | undefined = undefined;
  let remoteUrl: string | undefined = undefined;

  try {
    const stat = await fs.promises.stat(gitPath).catch(() => null);
    if (stat) {
      hasGit = true;
      if (stat.isFile()) {
        isWorktree = true;
      }
    }
  } catch {
    hasGit = false;
  }

  if (!hasGit) {
    return { hasGit: false };
  }

  // Attempt git CLI inspection first
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (branch && branch !== 'HEAD') {
      currentBranch = branch;
    } else if (branch === 'HEAD') {
      // Detached head, fetch short commit hash
      const commit = execSync('git rev-parse --short HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      currentBranch = commit ? `detached@${commit}` : 'HEAD';
    }
  } catch {
    // Fallback: parse .git file or directory manually
    try {
      let headFilePath = path.join(gitPath, 'HEAD');
      if (isWorktree) {
        const gitFileContent = await fs.promises.readFile(gitPath, 'utf-8');
        const match = gitFileContent.match(/gitdir:\s*(.+)/);
        if (match && match[1]) {
          headFilePath = path.join(match[1].trim(), 'HEAD');
        }
      }

      if (fs.existsSync(headFilePath)) {
        const headContent = await fs.promises.readFile(headFilePath, 'utf-8');
        const refMatch = headContent.match(/ref:\s*refs\/heads\/(.+)/);
        if (refMatch && refMatch[1]) {
          currentBranch = refMatch[1].trim();
        } else {
          currentBranch = headContent.trim().slice(0, 7);
        }
      }
    } catch {
      // Ignore fallback failures
    }
  }

  // Retrieve remote URL if available
  try {
    const remote = execSync('git config --get remote.origin.url', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (remote) {
      remoteUrl = remote;
    }
  } catch {
    // Ignore remote failure
  }

  return {
    hasGit: true,
    currentBranch,
    isWorktree,
    remoteUrl,
  };
}

/**
 * Loads package.json prioritizing studio/package.json, then root package.json.
 */
export async function loadProjectPackageJson(projectPath: string): Promise<{
  packageJson: ProjectPackageJson | null;
  packagePath: string | null;
}> {
  const studioPkgPath = path.join(projectPath, 'studio', 'package.json');
  const rootPkgPath = path.join(projectPath, 'package.json');

  if (fs.existsSync(studioPkgPath)) {
    try {
      const content = await fs.promises.readFile(studioPkgPath, 'utf-8');
      return {
        packageJson: JSON.parse(content),
        packagePath: studioPkgPath,
      };
    } catch {
      // Continue to root package.json fallback
    }
  }

  if (fs.existsSync(rootPkgPath)) {
    try {
      const content = await fs.promises.readFile(rootPkgPath, 'utf-8');
      return {
        packageJson: JSON.parse(content),
        packagePath: rootPkgPath,
      };
    } catch {
      // Return null if invalid JSON
    }
  }

  return { packageJson: null, packagePath: null };
}

/**
 * Detects framework dependency (React, Vite, Next, TanStack Start, Svelte, Vue).
 */
export function detectFramework(
  dependencies: Record<string, string> = {},
  devDependencies: Record<string, string> = {},
  configFiles: string[] = [],
  scripts: Record<string, string> = {}
): string {
  const allDeps = { ...dependencies, ...devDependencies };
  const depNames = Object.keys(allDeps).map((d) => d.toLowerCase());
  const configNames = configFiles.map((c) => c.toLowerCase());
  const scriptValues = Object.values(scripts).join(' ').toLowerCase();

  // 1. TanStack Start
  if (
    depNames.some((d) => d.includes('@tanstack/start') || d.includes('@tanstack/react-start')) ||
    configNames.some((c) => c.includes('app.config')) ||
    scriptValues.includes('tanstack-start')
  ) {
    return 'TanStack Start';
  }

  // 2. Next
  if (
    depNames.includes('next') ||
    configNames.some((c) => c.startsWith('next.config')) ||
    scriptValues.includes('next dev')
  ) {
    return 'Next';
  }

  // 3. Svelte
  if (
    depNames.includes('svelte') ||
    depNames.some((d) => d.startsWith('@sveltejs/')) ||
    configNames.some((c) => c.startsWith('svelte.config'))
  ) {
    return 'Svelte';
  }

  // 4. Vue
  if (
    depNames.includes('vue') ||
    depNames.includes('nuxt') ||
    depNames.includes('nuxt3') ||
    configNames.some((c) => c.startsWith('vue.config') || c.startsWith('nuxt.config'))
  ) {
    return 'Vue';
  }

  // 5. React
  const hasReact = depNames.includes('react') || depNames.includes('react-dom');
  if (hasReact) {
    return 'React';
  }

  // 6. Vite
  const hasVite =
    depNames.includes('vite') ||
    configNames.some((c) => c.startsWith('vite.config')) ||
    scriptValues.includes('vite');
  if (hasVite) {
    return 'Vite';
  }

  // 7. Express / Node
  if (depNames.includes('express')) {
    return 'Express';
  }

  return 'Node.js';
}

/**
 * Finds config files present in the project directory.
 */
export async function findConfigFiles(projectPath: string): Promise<string[]> {
  const configs: string[] = [];
  const candidateFiles = [
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mjs',
    'vite.config.cjs',
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'svelte.config.js',
    'nuxt.config.ts',
    'nuxt.config.js',
    'wrangler.jsonc',
    'wrangler.toml',
    'tsconfig.json',
    '.env',
    '.env.local',
    '.env.development',
  ];

  for (const file of candidateFiles) {
    if (fs.existsSync(path.join(projectPath, file))) {
      configs.push(file);
    }
  }

  return configs;
}

/**
 * Detects commonly used dev server ports (5173, 5199, 3000, 8080) from scripts or configs.
 */
export async function detectDevPort(
  projectPath: string,
  pkg: ProjectPackageJson | null,
  framework: string,
  configFiles: string[] = []
): Promise<{ devPort?: number; allDetectedPorts: number[] }> {
  const detectedPorts = new Set<number>();

  // 1. Check package.json scripts
  if (pkg?.scripts) {
    for (const scriptValue of Object.values(pkg.scripts)) {
      if (typeof scriptValue !== 'string') continue;

      // Check explicit flags like --port 5199 or -p 3000 or PORT=8080
      const flagMatches = scriptValue.matchAll(/(?:--port|-p|PORT=|port=)\s*(\d{4,5})/gi);
      for (const match of flagMatches) {
        const port = Number.parseInt(match[1], 10);
        if (!Number.isNaN(port) && port > 0 && port < 65536) {
          detectedPorts.add(port);
        }
      }

      // Check for known common ports
      for (const commonPort of COMMON_DEV_PORTS) {
        const regex = new RegExp(`\\b${commonPort}\\b`);
        if (regex.test(scriptValue)) {
          detectedPorts.add(commonPort);
        }
      }
    }
  }

  // 2. Check config files (vite.config.ts, .env, wrangler, etc.)
  for (const configFile of configFiles) {
    try {
      const configPath = path.join(projectPath, configFile);
      const content = await fs.promises.readFile(configPath, 'utf-8');

      const portMatches = content.matchAll(/(?:port|PORT)\s*[:=]\s*(\d{4,5})/gi);
      for (const match of portMatches) {
        const port = Number.parseInt(match[1], 10);
        if (!Number.isNaN(port) && port > 0 && port < 65536) {
          detectedPorts.add(port);
        }
      }

      for (const commonPort of COMMON_DEV_PORTS) {
        const regex = new RegExp(`\\b${commonPort}\\b`);
        if (regex.test(content)) {
          detectedPorts.add(commonPort);
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  const allDetected = Array.from(detectedPorts);

  // If a common port is explicitly found, prioritize it
  const prioritizedCommon = allDetected.find((p) => COMMON_DEV_PORTS.includes(p));
  if (prioritizedCommon) {
    return { devPort: prioritizedCommon, allDetectedPorts: allDetected };
  }

  if (allDetected.length > 0) {
    return { devPort: allDetected[0], allDetectedPorts: allDetected };
  }

  // 3. Fallback to standard framework default ports
  let fallbackPort: number | undefined = undefined;
  if (['Vite', 'React', 'Svelte', 'Vue'].includes(framework)) {
    fallbackPort = 5173;
  } else if (['Next', 'TanStack Start'].includes(framework)) {
    fallbackPort = 3000;
  } else if (framework === 'Express') {
    fallbackPort = 8080;
  }

  if (fallbackPort) {
    detectedPorts.add(fallbackPort);
  }

  return {
    devPort: fallbackPort,
    allDetectedPorts: Array.from(detectedPorts),
  };
}

/**
 * Scans directories in rootPath to discover workspace projects.
 * Default rootPath is '/home/chusni/orca/workspaces'.
 */
export async function scanWorkspaces(
  rootPath: string = '/home/chusni/orca/workspaces',
  options: WorkspaceScanOptions = {}
): Promise<ProjectInfo[]> {
  const resolvedRoot = path.resolve(rootPath);
  const projects: ProjectInfo[] = [];

  if (!fs.existsSync(resolvedRoot)) {
    return projects;
  }

  const projectDirs: string[] = [];

  // Check if rootPath itself is a project
  const isDirectProject =
    fs.existsSync(path.join(resolvedRoot, 'package.json')) ||
    fs.existsSync(path.join(resolvedRoot, 'studio', 'package.json')) ||
    fs.existsSync(path.join(resolvedRoot, '.git'));

  if (isDirectProject) {
    projectDirs.push(resolvedRoot);
  } else {
    // Scan level 1 and level 2
    try {
      const entries = await fs.promises.readdir(resolvedRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || IGNORED_DIRECTORIES.has(entry.name)) continue;

        const subPath = path.join(resolvedRoot, entry.name);
        const hasProjectManifest =
          fs.existsSync(path.join(subPath, 'package.json')) ||
          fs.existsSync(path.join(subPath, 'studio', 'package.json')) ||
          fs.existsSync(path.join(subPath, '.git'));

        if (hasProjectManifest) {
          projectDirs.push(subPath);
        } else {
          // Check level 2 subdirectories (worktrees, nested project folders)
          try {
            const nestedEntries = await fs.promises.readdir(subPath, { withFileTypes: true });
            for (const nestedEntry of nestedEntries) {
              if (!nestedEntry.isDirectory()) continue;
              if (nestedEntry.name.startsWith('.') || IGNORED_DIRECTORIES.has(nestedEntry.name)) continue;

              const nestedPath = path.join(subPath, nestedEntry.name);
              const nestedManifest =
                fs.existsSync(path.join(nestedPath, 'package.json')) ||
                fs.existsSync(path.join(nestedPath, 'studio', 'package.json')) ||
                fs.existsSync(path.join(nestedPath, '.git'));

              if (nestedManifest) {
                projectDirs.push(nestedPath);
              }
            }
          } catch {
            // Ignore nested read errors
          }
        }
      }
    } catch (err) {
      console.error(`Error scanning workspaces at ${resolvedRoot}:`, err);
      return projects;
    }
  }

  // Process all discovered project directories
  for (const projectDir of projectDirs) {
    try {
      const stat = await fs.promises.stat(projectDir).catch(() => null);
      if (!stat) continue;

      const { packageJson } = await loadProjectPackageJson(projectDir);
      const configFiles = await findConfigFiles(projectDir);
      const gitInfo = await detectGitInfo(projectDir);

      const framework = detectFramework(
        packageJson?.dependencies || {},
        packageJson?.devDependencies || {},
        configFiles,
        packageJson?.scripts || {}
      );

      const { devPort } = await detectDevPort(projectDir, packageJson, framework, configFiles);

      // Check if port is actively listening
      let status: ProjectStatus = 'idle';
      if (devPort) {
        const active = await isPortActive(devPort);
        if (active) {
          status = 'running';
        }
      }

      const id = path.basename(projectDir);
      const name = packageJson?.name || id;

      // Determine accurate lastModified
      let lastModifiedTime = stat.mtimeMs;
      const pkgPath = path.join(projectDir, 'package.json');
      const pkgStat = await fs.promises.stat(pkgPath).catch(() => null);
      if (pkgStat && pkgStat.mtimeMs > lastModifiedTime) {
        lastModifiedTime = pkgStat.mtimeMs;
      }

      projects.push({
        id,
        name,
        path: projectDir,
        framework,
        hasGit: gitInfo.hasGit,
        currentBranch: gitInfo.currentBranch,
        activeDevPort: devPort,
        status,
        lastModified: new Date(lastModifiedTime).toISOString(),
      });
    } catch (err) {
      console.error(`Failed to process project directory ${projectDir}:`, err);
    }
  }

  // Sort alphabetically by project name
  projects.sort((a, b) => a.name.localeCompare(b.name));
  return projects;
}

/**
 * Retrieves detailed information about a single workspace project by ID or path.
 */
export async function findProjectDetail(
  idOrPath: string,
  rootPath: string = '/home/chusni/orca/workspaces'
): Promise<ProjectDetail | null> {
  const projects = await scanWorkspaces(rootPath);

  // Match by id, exact path, or folder basename
  let target = projects.find(
    (p) =>
      p.id === idOrPath ||
      p.path === idOrPath ||
      path.resolve(p.path) === path.resolve(idOrPath) ||
      path.basename(p.path) === idOrPath
  );

  // If not found in scan results and idOrPath exists on disk, construct directly
  if (!target && fs.existsSync(idOrPath)) {
    const singleProjects = await scanWorkspaces(idOrPath);
    if (singleProjects.length > 0) {
      target = singleProjects[0];
    }
  }

  if (!target) {
    return null;
  }

  const projectDir = target.path;
  const { packageJson } = await loadProjectPackageJson(projectDir);
  const configFiles = await findConfigFiles(projectDir);
  const gitInfo = await detectGitInfo(projectDir);
  const { allDetectedPorts } = await detectDevPort(
    projectDir,
    packageJson,
    target.framework,
    configFiles
  );

  return {
    ...target,
    packageJson: packageJson || undefined,
    scripts: packageJson?.scripts,
    dependencies: packageJson?.dependencies,
    devDependencies: packageJson?.devDependencies,
    isGitWorktree: gitInfo.isWorktree,
    gitRemoteUrl: gitInfo.remoteUrl,
    portsDetected: allDetectedPorts,
    detectedConfigs: configFiles,
  };
}

/**
 * Express handler / service function for GET /api/projects.
 * Can be called as Express route handler or directly as a function.
 */
export async function getProjects(
  reqOrRootPath?: Request | string,
  res?: Response
): Promise<ProjectInfo[] | void> {
  if (res && typeof res.json === 'function') {
    const req = reqOrRootPath as Request;
    try {
      const rootPath = typeof req.query?.rootPath === 'string' ? req.query.rootPath : undefined;
      const projects = await scanWorkspaces(rootPath);
      res.json({
        success: true,
        data: projects,
        timestamp: new Date().toISOString(),
      });
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to scan workspaces';
      res.status(500).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }

  const rootPath = typeof reqOrRootPath === 'string' ? reqOrRootPath : undefined;
  return scanWorkspaces(rootPath);
}

/**
 * Express handler / service function for GET /api/projects/:id.
 * Can be called as Express route handler or directly as a function.
 */
export async function getProjectDetail(
  idOrReq: string | Request,
  resOrRootPath?: Response | string
): Promise<ProjectDetail | null | void> {
  if (resOrRootPath && typeof (resOrRootPath as Response).json === 'function') {
    const req = idOrReq as Request;
    const res = resOrRootPath as Response;

    try {
      const rawId = req.params?.id;
      const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : (typeof req.query?.id === 'string' ? req.query.id : undefined);
      const rootPath = typeof req.query?.rootPath === 'string' ? req.query.rootPath : undefined;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Project ID is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const detail = await findProjectDetail(id, rootPath);
      if (!detail) {
        res.status(404).json({
          success: false,
          error: `Project not found: ${id}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.json({
        success: true,
        data: detail,
        timestamp: new Date().toISOString(),
      });
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to retrieve project detail';
      res.status(500).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }

  let id: string | undefined;
  if (typeof idOrReq === 'string') {
    id = idOrReq;
  } else {
    const rawParam = (idOrReq as Request)?.params?.id;
    if (typeof rawParam === 'string') {
      id = rawParam;
    } else if (Array.isArray(rawParam) && rawParam.length > 0) {
      id = rawParam[0];
    }
  }
  const rootPath = typeof resOrRootPath === 'string' ? resOrRootPath : undefined;

  if (!id) {
    return null;
  }

  return findProjectDetail(id, rootPath);
}

/**
 * Express router for ArtaStudio workspace discovery API endpoints.
 */
export const workspaceRouter: Router = Router();

workspaceRouter.get('/', async (req: Request, res: Response) => {
  await getProjects(req, res);
});

workspaceRouter.get('/:id', async (req: Request, res: Response) => {
  await getProjectDetail(req, res);
});

export default workspaceRouter;
