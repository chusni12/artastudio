import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SKRIPT_MD } from '../../shared/defaultSkript';
import type { SkriptStateResponse } from '../../shared/types';
import { broadcastWebSocketEvent } from '../ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTASTUDIO_ROOT = path.resolve(__dirname, '../..');

const GLOBAL_DEFAULT_FILE = path.join(ARTASTUDIO_ROOT, 'skript-default.md');
const STATE_FILE = path.join(ARTASTUDIO_ROOT, 'skript-state.json');

interface ProjectSkriptEntry {
  customized: boolean;
  baseHash: string;
}

interface SkriptStateStore {
  projects: Record<string, ProjectSkriptEntry>;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function normalizeProjectKey(projectPath: string): string {
  return path.resolve(projectPath);
}

function loadState(): SkriptStateStore {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object' && parsed.projects && typeof parsed.projects === 'object') {
        return { projects: parsed.projects };
      }
    }
  } catch {}
  return { projects: {} };
}

function saveState(state: SkriptStateStore): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[SkriptService] Gagal menyimpan skript-state.json:', err);
  }
}

export function hasCustomGlobalDefault(): boolean {
  try {
    if (!fs.existsSync(GLOBAL_DEFAULT_FILE)) return false;
    const raw = fs.readFileSync(GLOBAL_DEFAULT_FILE, 'utf8');
    return raw.trim().length > 0;
  } catch {
    return false;
  }
}

export function getEffectiveDefaultSkript(): string {
  try {
    if (fs.existsSync(GLOBAL_DEFAULT_FILE)) {
      const raw = fs.readFileSync(GLOBAL_DEFAULT_FILE, 'utf8');
      if (raw.trim().length > 0) {
        return raw;
      }
    }
  } catch {}
  return DEFAULT_SKRIPT_MD;
}

export function syncProjectSkript(projectPath: string): {
  projectPath: string;
  skriptPath: string;
  customized: boolean;
  updated: boolean;
} {
  const resolvedProject = normalizeProjectKey(projectPath || process.cwd());
  const skriptPath = path.join(resolvedProject, 'skript.md');
  const effectiveDefault = getEffectiveDefaultSkript();
  const effectiveHash = sha256(effectiveDefault);
  const builtinHash = sha256(DEFAULT_SKRIPT_MD);

  if (!fs.existsSync(resolvedProject)) {
    return { projectPath: resolvedProject, skriptPath, customized: false, updated: false };
  }

  const state = loadState();
  const entry = state.projects[resolvedProject];

  if (!fs.existsSync(skriptPath)) {
    try {
      fs.writeFileSync(skriptPath, effectiveDefault, 'utf8');
      state.projects[resolvedProject] = { customized: false, baseHash: effectiveHash };
      saveState(state);
      return { projectPath: resolvedProject, skriptPath, customized: false, updated: true };
    } catch (err) {
      console.warn('[SkriptService] Gagal menulis skript.md default:', err);
      return { projectPath: resolvedProject, skriptPath, customized: false, updated: false };
    }
  }

  let currentContent = '';
  try {
    currentContent = fs.readFileSync(skriptPath, 'utf8');
  } catch {
    return { projectPath: resolvedProject, skriptPath, customized: Boolean(entry?.customized), updated: false };
  }

  const currentHash = sha256(currentContent);
  const matchesKnownDefault =
    currentHash === effectiveHash ||
    currentHash === builtinHash ||
    (Boolean(entry?.baseHash) && currentHash === entry?.baseHash);

  if (!entry?.customized && matchesKnownDefault) {
    let updated = false;
    if (currentHash !== effectiveHash) {
      try {
        fs.writeFileSync(skriptPath, effectiveDefault, 'utf8');
        updated = true;
      } catch (err) {
        console.warn('[SkriptService] Gagal memperbarui skript.md proyek:', err);
      }
    }
    state.projects[resolvedProject] = { customized: false, baseHash: effectiveHash };
    saveState(state);
    return { projectPath: resolvedProject, skriptPath, customized: false, updated };
  }

  // Proyek memiliki editan lokal -> tandai customized dan JANGAN pernah timpa
  state.projects[resolvedProject] = {
    customized: true,
    baseHash: entry?.baseHash || effectiveHash,
  };
  saveState(state);
  return { projectPath: resolvedProject, skriptPath, customized: true, updated: false };
}

export function getSkriptState(projectPath: string): SkriptStateResponse {
  const resolvedProject = normalizeProjectKey(projectPath || process.cwd());
  const syncResult = syncProjectSkript(resolvedProject);
  const defaultContent = getEffectiveDefaultSkript();
  let content = defaultContent;

  try {
    if (fs.existsSync(syncResult.skriptPath)) {
      content = fs.readFileSync(syncResult.skriptPath, 'utf8');
    }
  } catch {}

  return {
    projectPath: resolvedProject,
    content,
    defaultContent,
    builtinDefaultContent: DEFAULT_SKRIPT_MD,
    isCustomized: syncResult.customized,
    hasCustomGlobalDefault: hasCustomGlobalDefault(),
  };
}

function syncAllTrackedNonCustomizedProjects(extraProjectPath?: string): string[] {
  const state = loadState();
  const effectiveDefault = getEffectiveDefaultSkript();
  const effectiveHash = sha256(effectiveDefault);
  const syncedProjects: string[] = [];

  const candidatePaths = new Set<string>(Object.keys(state.projects));
  if (extraProjectPath) {
    candidatePaths.add(normalizeProjectKey(extraProjectPath));
  }

  for (const projPath of candidatePaths) {
    if (!fs.existsSync(projPath)) continue;
    const entry = state.projects[projPath];
    if (entry?.customized) continue;

    const skriptPath = path.join(projPath, 'skript.md');
    try {
      fs.writeFileSync(skriptPath, effectiveDefault, 'utf8');
      state.projects[projPath] = { customized: false, baseHash: effectiveHash };
      syncedProjects.push(projPath);
    } catch (err) {
      console.warn(`[SkriptService] Gagal sinkronisasi ulang ${projPath}:`, err);
    }
  }

  saveState(state);
  return syncedProjects;
}

export function saveSkript(
  projectPath: string,
  content: string,
  scope: 'project' | 'default'
): SkriptStateResponse {
  const resolvedProject = normalizeProjectKey(projectPath || process.cwd());

  if (scope === 'default') {
    fs.writeFileSync(GLOBAL_DEFAULT_FILE, content, 'utf8');
    const syncedProjects = syncAllTrackedNonCustomizedProjects(resolvedProject);
    broadcastWebSocketEvent('system', 'skript:updated', {
      scope: 'default',
      projectPath: resolvedProject,
      syncedProjects,
    });
    return getSkriptState(resolvedProject);
  }

  // scope === 'project'
  if (!fs.existsSync(resolvedProject)) {
    throw new Error(`Direktori proyek tidak ditemukan: ${resolvedProject}`);
  }

  const skriptPath = path.join(resolvedProject, 'skript.md');
  fs.writeFileSync(skriptPath, content, 'utf8');

  const effectiveDefault = getEffectiveDefaultSkript();
  const effectiveHash = sha256(effectiveDefault);
  const isCustomized = sha256(content) !== effectiveHash;

  const state = loadState();
  state.projects[resolvedProject] = {
    customized: isCustomized,
    baseHash: effectiveHash,
  };
  saveState(state);

  broadcastWebSocketEvent('system', 'skript:updated', {
    scope: 'project',
    projectPath: resolvedProject,
    isCustomized,
  });

  return getSkriptState(resolvedProject);
}

export function resetSkript(
  projectPath: string,
  scope: 'project' | 'default'
): SkriptStateResponse {
  const resolvedProject = normalizeProjectKey(projectPath || process.cwd());

  if (scope === 'default') {
    if (fs.existsSync(GLOBAL_DEFAULT_FILE)) {
      fs.unlinkSync(GLOBAL_DEFAULT_FILE);
    }
    const syncedProjects = syncAllTrackedNonCustomizedProjects(resolvedProject);
    broadcastWebSocketEvent('system', 'skript:updated', {
      scope: 'default',
      reset: true,
      projectPath: resolvedProject,
      syncedProjects,
    });
    return getSkriptState(resolvedProject);
  }

  // scope === 'project'
  if (!fs.existsSync(resolvedProject)) {
    throw new Error(`Direktori proyek tidak ditemukan: ${resolvedProject}`);
  }

  const effectiveDefault = getEffectiveDefaultSkript();
  const effectiveHash = sha256(effectiveDefault);
  const skriptPath = path.join(resolvedProject, 'skript.md');
  fs.writeFileSync(skriptPath, effectiveDefault, 'utf8');

  const state = loadState();
  state.projects[resolvedProject] = {
    customized: false,
    baseHash: effectiveHash,
  };
  saveState(state);

  broadcastWebSocketEvent('system', 'skript:updated', {
    scope: 'project',
    reset: true,
    projectPath: resolvedProject,
    isCustomized: false,
  });

  return getSkriptState(resolvedProject);
}
