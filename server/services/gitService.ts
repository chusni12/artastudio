/**
 * ArtaStudio - Git Engine & Commit Timeline Service
 * 
 * Modul 2: Layanan backend Git Engine untuk inspeksi riwayat commit,
 * komparasi diff, time-travel preview, dan revert commit yang aman.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs';
import express from 'express';
import type { Request, Response, Router } from 'express';

const execFileAsync = promisify(execFile);

// ============================================================================
// Types & Interfaces
// ============================================================================

export type CommitType = 'feat' | 'fix' | 'chore' | 'docs' | 'refactor' | 'other';

export interface CommitAuthor {
  name: string;
  email: string;
}

export interface CommitItem {
  hash: string;
  fullHash: string;
  message: string;
  body?: string;
  author: CommitAuthor;
  timestamp: string;
  relativeTime: string;
  type: CommitType;
  scope?: string;
}

export interface CommitHistoryResult {
  projectPath: string;
  total: number;
  commits: CommitItem[];
  byType: Record<CommitType, CommitItem[]>;
}

export type FileDiffStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied' | 'unknown';

export interface FileDiff {
  filePath: string;
  oldPath?: string;
  additions: number;
  deletions: number;
  changes: number;
  status: FileDiffStatus;
  diff: string;
  isBinary: boolean;
}

export interface CommitDiffResult {
  commitHash: string;
  shortHash: string;
  author?: CommitAuthor;
  date?: string;
  message?: string;
  filesChanged: number;
  totalAdditions: number;
  totalDeletions: number;
  files: FileDiff[];
  rawStat: string;
  rawDiff: string;
}

export interface PreviewOptions {
  autoStash?: boolean;
}

export interface PreviewCommitResult {
  success: boolean;
  projectPath: string;
  commitHash: string;
  shortHash: string;
  message: string;
  author: CommitAuthor;
  timestamp: string;
  isDetached: boolean;
  previousRef: string;
  stashed: boolean;
}

export interface RevertOptions {
  autoCommit?: boolean;
}

export interface RevertCommitResult {
  success: boolean;
  projectPath: string;
  originalCommitHash: string;
  revertCommitHash: string;
  revertShortHash: string;
  message: string;
}

// Delimiters for git log formatting
const DELIM_FIELD = '\x1f';
const DELIM_RECORD = '\x1e';

// Regex for commit hash safety
const HASH_REGEX = /^[a-fA-F0-9]{4,64}$|^[a-zA-Z0-9_\-\./]+$/;

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Execute git command safely with child_process.execFile.
 */
async function runGit(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 25 * 1024 * 1024,
    env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
  });
  return result.stdout;
}

/**
 * Validates that the provided path exists and is a git repository.
 */
async function validateGitRepository(targetPath: string): Promise<string> {
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolved}`);
  }
  try {
    const isWorkTree = await runGit(['rev-parse', '--is-inside-work-tree'], resolved);
    if (isWorkTree.trim() !== 'true') {
      throw new Error(`Path is not inside a git work tree: ${resolved}`);
    }
  } catch (err: any) {
    throw new Error(`Not a git repository: ${resolved} (${err.message})`);
  }
  return resolved;
}

/**
 * Validates commit hash format to prevent command injection.
 */
function sanitizeCommitHash(hash: string): string {
  const trimmed = (hash || '').trim();
  if (!trimmed || !HASH_REGEX.test(trimmed)) {
    throw new Error(`Invalid git commit hash or reference: "${hash}"`);
  }
  return trimmed;
}

/**
 * Parses conventional commit type and scope from commit message.
 * Categorizes into feat, fix, chore, docs, refactor, or other.
 */
export function parseCommitClassification(message: string): { type: CommitType; scope?: string } {
  const trimmed = (message || '').trim();

  // Match conventional commit: feat(scope): subject or feat: subject
  const match = trimmed.match(/^([a-zA-Z0-9_-]+)(?:\(([^)]+)\))?!?:\s*(.+)$/);
  if (match) {
    const rawType = match[1].toLowerCase();
    const scope = match[2]?.trim();

    if (rawType === 'feat') return { type: 'feat', scope };
    if (rawType === 'fix') return { type: 'fix', scope };
    if (rawType === 'chore') return { type: 'chore', scope };
    if (rawType === 'docs') return { type: 'docs', scope };
    if (rawType === 'refactor') return { type: 'refactor', scope };
    if (rawType === 'ci' || rawType === 'build' || rawType === 'test') return { type: 'chore', scope };
    if (rawType === 'perf' || rawType === 'style') return { type: 'refactor', scope };
  }

  // Fallback matching starting words
  const prefixMatch = trimmed.match(/^(feat|fix|chore|docs|refactor)\b/i);
  if (prefixMatch) {
    const rawType = prefixMatch[1].toLowerCase() as CommitType;
    return { type: rawType };
  }

  return { type: 'other' };
}

/**
 * Parses arrow notation for renamed files in numstat lines.
 */
function parseNumstatPath(rawPath: string): { oldPath?: string; newPath: string } {
  if (!rawPath.includes('=>')) {
    return { newPath: rawPath };
  }
  const braceMatch = rawPath.match(/^(.*?)\{(.*?) => (.*?)\}(.*)$/);
  if (braceMatch) {
    const [, prefix, oldPart, newPart, suffix] = braceMatch;
    return {
      oldPath: `${prefix}${oldPart}${suffix}`.replace(/\/{2,}/g, '/'),
      newPath: `${prefix}${newPart}${suffix}`.replace(/\/{2,}/g, '/'),
    };
  }
  const simpleMatch = rawPath.match(/^(.*?) => (.*?)$/);
  if (simpleMatch) {
    return {
      oldPath: simpleMatch[1].trim(),
      newPath: simpleMatch[2].trim(),
    };
  }
  return { newPath: rawPath };
}

/**
 * Parses unified diff and numstat into structured FileDiff items.
 */
function parseDiffAndNumstat(rawDiff: string, numstatOutput: string): FileDiff[] {
  const numstatMap = new Map<string, { additions: number; deletions: number; isBinary: boolean; oldPath?: string }>();

  for (const line of numstatOutput.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    if (parts.length >= 3) {
      const addStr = parts[0];
      const delStr = parts[1];
      const rawFilePath = parts.slice(2).join('\t');
      const isBinary = addStr === '-' && delStr === '-';
      const parsedPath = parseNumstatPath(rawFilePath);

      numstatMap.set(parsedPath.newPath, {
        additions: isBinary ? 0 : parseInt(addStr, 10) || 0,
        deletions: isBinary ? 0 : parseInt(delStr, 10) || 0,
        isBinary,
        oldPath: parsedPath.oldPath,
      });
    }
  }

  const files: FileDiff[] = [];
  const rawSections = rawDiff.split(/^diff --git /m);

  for (const section of rawSections) {
    if (!section.trim()) continue;
    const fullBlock = 'diff --git ' + section;
    const firstLine = section.split('\n')[0] || '';
    const match = firstLine.match(/a\/(.+?)\s+b\/(.+)$/);
    if (!match) continue;

    const oldPath = match[1];
    const newPath = match[2];
    const filePath = newPath === '/dev/null' ? oldPath : newPath;

    let status: FileDiffStatus = 'modified';
    if (section.includes('new file mode') || oldPath === '/dev/null') {
      status = 'added';
    } else if (section.includes('deleted file mode') || newPath === '/dev/null') {
      status = 'deleted';
    } else if (section.includes('rename from ')) {
      status = 'renamed';
    } else if (section.includes('copy from ')) {
      status = 'copied';
    }

    let numstat = numstatMap.get(filePath) || numstatMap.get(newPath) || numstatMap.get(oldPath);

    let additions = numstat ? numstat.additions : 0;
    let deletions = numstat ? numstat.deletions : 0;
    const isBinary = numstat ? numstat.isBinary : /Binary files (.*) and (.*) differ/.test(section);

    if (!numstat && !isBinary) {
      const lines = section.split('\n');
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++;
        }
      }
    }

    files.push({
      filePath,
      oldPath: status === 'renamed' ? (numstat?.oldPath || oldPath) : undefined,
      additions,
      deletions,
      changes: additions + deletions,
      status,
      diff: fullBlock,
      isBinary,
    });
  }

  // Include any extra files found in numstat that didn't have patch text
  for (const [pathKey, stat] of Array.from(numstatMap.entries())) {
    const existing = files.find((f) => f.filePath === pathKey || f.oldPath === pathKey);
    if (!existing) {
      files.push({
        filePath: pathKey,
        oldPath: stat.oldPath,
        additions: stat.additions,
        deletions: stat.deletions,
        changes: stat.additions + stat.deletions,
        status: stat.additions > 0 && stat.deletions === 0 ? 'added' : 'modified',
        diff: '',
        isBinary: stat.isBinary,
      });
    }
  }

  return files;
}

// ============================================================================
// Core Service Methods
// ============================================================================

/**
 * 1. getCommitHistory(projectPath: string, limit: number = 20)
 *
 * Runs `git log` and formats the output into JSON:
 * - short hash, full hash, message/title, author, timestamp, relative time.
 * - Categorizes commits into feat, fix, chore, docs, refactor, and other.
 */
export async function getCommitHistory(
  projectPath: string,
  limit: number = 20
): Promise<CommitHistoryResult> {
  const cwd = await validateGitRepository(projectPath);
  const clampedLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 20), 500));

  const byType: Record<CommitType, CommitItem[]> = {
    feat: [],
    fix: [],
    chore: [],
    docs: [],
    refactor: [],
    other: [],
  };

  const commits: CommitItem[] = [];

  try {
    const format = `%H${DELIM_FIELD}%h${DELIM_FIELD}%an${DELIM_FIELD}%ae${DELIM_FIELD}%aI${DELIM_FIELD}%cr${DELIM_FIELD}%s${DELIM_FIELD}%b${DELIM_RECORD}`;
    const stdout = await runGit(['log', `-n`, String(clampedLimit), `--format=${format}`], cwd);

    const records = stdout.split(DELIM_RECORD);

    for (const record of records) {
      const trimmed = record.trim();
      if (!trimmed) continue;

      const fields = trimmed.split(DELIM_FIELD);
      if (fields.length < 7) continue;

      const [fullHash, hash, name, email, timestamp, relativeTime, message, ...bodyParts] = fields;
      const body = bodyParts.join(DELIM_FIELD).trim();
      const classification = parseCommitClassification(message);

      const item: CommitItem = {
        hash,
        fullHash,
        message,
        body: body.length > 0 ? body : undefined,
        author: {
          name,
          email,
        },
        timestamp,
        relativeTime,
        type: classification.type,
        scope: classification.scope,
      };

      commits.push(item);
      byType[classification.type].push(item);
    }
  } catch (err: any) {
    // If repository has no commits yet, return empty result gracefully
    if (err.message && err.message.includes('does not have any commits yet')) {
      return {
        projectPath: cwd,
        total: 0,
        commits: [],
        byType,
      };
    }
    throw err;
  }

  return {
    projectPath: cwd,
    total: commits.length,
    commits,
    byType,
  };
}

/**
 * 2. getCommitDiff(projectPath: string, commitHash: string)
 *
 * Runs `git show <commitHash> --stat` and `git diff <commitHash>^!`.
 * Parses:
 * - list of changed files
 * - lines added (+ green)
 * - lines deleted (- red)
 * - diff chunks / hunks
 */
export async function getCommitDiff(
  projectPath: string,
  commitHash: string
): Promise<CommitDiffResult> {
  const cwd = await validateGitRepository(projectPath);
  const cleanHash = sanitizeCommitHash(commitHash);

  // Verify commit exists and resolve canonical full SHA
  const fullHash = (await runGit(['rev-parse', '--verify', `${cleanHash}^{commit}`], cwd)).trim();

  // Fetch commit summary metadata
  const metaFormat = `%H${DELIM_FIELD}%h${DELIM_FIELD}%an${DELIM_FIELD}%ae${DELIM_FIELD}%aI${DELIM_FIELD}%s`;
  const metaOutput = (await runGit(['log', '-1', `--format=${metaFormat}`, fullHash], cwd)).trim();
  const [metaFull, shortHash, authorName, authorEmail, date, message] = metaOutput.split(DELIM_FIELD);

  // 1. Run git show <commitHash> --stat
  let rawStat = '';
  try {
    rawStat = await runGit(['show', fullHash, '--stat', '--no-color'], cwd);
  } catch {
    rawStat = '';
  }

  // 2. Run git diff <commitHash>^! (diff of commit against its parents)
  let rawDiff = '';
  let numstatOutput = '';

  try {
    rawDiff = await runGit(['diff', `${fullHash}^!`, '--no-color'], cwd);
    numstatOutput = await runGit(['diff', `${fullHash}^!`, '--numstat'], cwd);
  } catch {
    // Fallback for root commit (no parent)
    try {
      rawDiff = await runGit(['diff-tree', '--root', '-p', fullHash, '--no-color'], cwd);
      numstatOutput = await runGit(['diff-tree', '--root', '--numstat', '-r', fullHash], cwd);
    } catch {
      // Secondary fallback
      rawDiff = await runGit(['show', fullHash, '--no-color', '--format='], cwd);
      numstatOutput = '';
    }
  }

  const files = parseDiffAndNumstat(rawDiff, numstatOutput);

  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const file of files) {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }

  return {
    commitHash: fullHash,
    shortHash: shortHash || fullHash.slice(0, 8),
    author: authorName
      ? {
          name: authorName,
          email: authorEmail || '',
        }
      : undefined,
    date,
    message,
    filesChanged: files.length,
    totalAdditions,
    totalDeletions,
    files,
    rawStat,
    rawDiff,
  };
}

/**
 * 3. previewAtCommit(projectPath: string, commitHash: string, options?: PreviewOptions)
 *
 * Safe command to `git checkout <commitHash>` in detached HEAD mode for time-travel inspection.
 * Automatically checks and preserves dirty working tree using git stash if needed.
 */
export async function previewAtCommit(
  projectPath: string,
  commitHash: string,
  options: PreviewOptions = {}
): Promise<PreviewCommitResult> {
  const cwd = await validateGitRepository(projectPath);
  const cleanHash = sanitizeCommitHash(commitHash);

  // Verify commit exists
  const fullHash = (await runGit(['rev-parse', '--verify', `${cleanHash}^{commit}`], cwd)).trim();

  // Get current ref/branch before switching
  let previousRef = '';
  try {
    previousRef = (await runGit(['symbolic-ref', '--short', 'HEAD'], cwd)).trim();
  } catch {
    // If already in detached HEAD, save current SHA
    previousRef = (await runGit(['rev-parse', 'HEAD'], cwd)).trim();
  }

  // Check working directory status
  const statusOutput = (await runGit(['status', '--porcelain'], cwd)).trim();
  const isDirty = statusOutput.length > 0;
  let stashed = false;

  if (isDirty) {
    if (options.autoStash !== false) {
      const stashMsg = `ArtaStudio-Preview-Stash-${cleanHash.slice(0, 8)}-${Date.now()}`;
      await runGit(['stash', 'push', '-u', '-m', stashMsg], cwd);
      stashed = true;
    } else {
      throw new Error(
        'Working tree has uncommitted modifications. Please stash or commit changes before previewing.'
      );
    }
  }

  // Perform detached checkout
  await runGit(['checkout', '--detach', fullHash], cwd);

  // Retrieve inspected commit metadata
  const metaFormat = `%H${DELIM_FIELD}%h${DELIM_FIELD}%an${DELIM_FIELD}%ae${DELIM_FIELD}%aI${DELIM_FIELD}%s`;
  const metaOutput = (await runGit(['log', '-1', `--format=${metaFormat}`, fullHash], cwd)).trim();
  const [, shortHash, authorName, authorEmail, timestamp, message] = metaOutput.split(DELIM_FIELD);

  return {
    success: true,
    projectPath: cwd,
    commitHash: fullHash,
    shortHash: shortHash || fullHash.slice(0, 8),
    message: message || '',
    author: {
      name: authorName || '',
      email: authorEmail || '',
    },
    timestamp: timestamp || new Date().toISOString(),
    isDetached: true,
    previousRef,
    stashed,
  };
}

/**
 * Restores working directory from preview state back to a branch.
 */
export async function restorePreview(
  projectPath: string,
  targetRef?: string,
  popStash: boolean = true
): Promise<{ success: boolean; currentRef: string; poppedStash: boolean }> {
  const cwd = await validateGitRepository(projectPath);
  const target = targetRef ? sanitizeCommitHash(targetRef) : 'main';

  await runGit(['checkout', target], cwd);
  const currentRef = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).trim();

  let poppedStash = false;
  if (popStash) {
    try {
      const stashList = await runGit(['stash', 'list'], cwd);
      if (stashList.includes('ArtaStudio-Preview-Stash')) {
        await runGit(['stash', 'pop'], cwd);
        poppedStash = true;
      }
    } catch {
      // Ignore if no stash to pop
    }
  }

  return {
    success: true,
    currentRef,
    poppedStash,
  };
}

/**
 * 4. revertCommit(projectPath: string, commitHash: string, options?: RevertOptions)
 *
 * Safe command to rollback/undo a commit.
 * Verifies working tree cleanliness, handles merge commits (-m 1),
 * and automatically aborts cleanly if any merge conflict occurs.
 */
export async function revertCommit(
  projectPath: string,
  commitHash: string,
  options: RevertOptions = {}
): Promise<RevertCommitResult> {
  const cwd = await validateGitRepository(projectPath);
  const cleanHash = sanitizeCommitHash(commitHash);

  // Verify commit exists
  const fullHash = (await runGit(['rev-parse', '--verify', `${cleanHash}^{commit}`], cwd)).trim();

  // Check working tree cleanliness
  const statusOutput = (await runGit(['status', '--porcelain'], cwd)).trim();
  if (statusOutput.length > 0) {
    throw new Error(
      'Working tree has uncommitted modifications. Please commit or stash changes before reverting.'
    );
  }

  // Check if commit is a merge commit (has more than 1 parent)
  const parentsOutput = (await runGit(['rev-list', '--parents', '-n', '1', fullHash], cwd)).trim();
  const parentTokens = parentsOutput.split(/\s+/);
  const isMergeCommit = parentTokens.length > 2;

  const revertArgs = ['revert', '--no-edit'];
  if (isMergeCommit) {
    revertArgs.push('-m', '1');
  }
  revertArgs.push(fullHash);

  try {
    await runGit(revertArgs, cwd);
  } catch (err: any) {
    // Safety rollback: abort revert to leave tree clean
    try {
      await runGit(['revert', '--abort'], cwd);
    } catch {
      // Ignore abort errors
    }

    const error = new Error(
      `Revert failed due to merge conflicts or git error: ${err.message}. Revert was safely aborted.`
    );
    (error as any).conflicted = true;
    throw error;
  }

  // Get resulting commit info
  const newCommitHash = (await runGit(['rev-parse', 'HEAD'], cwd)).trim();
  const newShortHash = (await runGit(['rev-parse', '--short', 'HEAD'], cwd)).trim();
  const commitMsg = (await runGit(['log', '-1', '--pretty=%B'], cwd)).trim();

  return {
    success: true,
    projectPath: cwd,
    originalCommitHash: fullHash,
    revertCommitHash: newCommitHash,
    revertShortHash: newShortHash,
    message: commitMsg,
  };
}

// ============================================================================
// Express Router & Handlers
// ============================================================================

/**
 * Express handler for GET /history or GET /commits
 */
export async function handleGetCommitHistory(req: Request, res: Response): Promise<void> {
  try {
    const projectPath = ((req.query.path || req.query.projectPath || process.cwd()) as string);
    const limit = parseInt((req.query.limit || '20') as string, 10);

    const history = await getCommitHistory(projectPath, isNaN(limit) ? 20 : limit);
    res.status(200).json({ success: true, data: history });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to get commit history' });
  }
}

/**
 * Express handler for GET /diff/:commitHash
 */
export async function handleGetCommitDiff(req: Request, res: Response): Promise<void> {
  try {
    const projectPath = ((req.query.path || req.query.projectPath || req.body?.projectPath || process.cwd()) as string);
    const commitHash = (req.params.commitHash || req.query.commitHash || req.body?.commitHash) as string;

    if (!commitHash) {
      res.status(400).json({ success: false, error: 'Parameter commitHash is required' });
      return;
    }

    const diffResult = await getCommitDiff(projectPath, commitHash);
    res.status(200).json({ success: true, data: diffResult });
  } catch (err: any) {
    const status = err.message && err.message.includes('Invalid git commit') ? 400 : 500;
    res.status(status).json({ success: false, error: err.message || 'Failed to get commit diff' });
  }
}

/**
 * Express handler for POST /preview
 */
export async function handlePreviewAtCommit(req: Request, res: Response): Promise<void> {
  try {
    const projectPath = ((req.body?.projectPath || req.query.path || process.cwd()) as string);
    const commitHash = (req.body?.commitHash || req.query.commitHash) as string;
    const autoStash = req.body?.autoStash !== false;

    if (!commitHash) {
      res.status(400).json({ success: false, error: 'Body field commitHash is required' });
      return;
    }

    const result = await previewAtCommit(projectPath, commitHash, { autoStash });
    res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    const isClientError =
      err.message &&
      (err.message.includes('Invalid git commit') || err.message.includes('uncommitted modifications'));
    res.status(isClientError ? 400 : 500).json({
      success: false,
      error: err.message || 'Failed to preview commit',
    });
  }
}

/**
 * Express handler for POST /revert
 */
export async function handleRevertCommit(req: Request, res: Response): Promise<void> {
  try {
    const projectPath = ((req.body?.projectPath || req.query.path || process.cwd()) as string);
    const commitHash = (req.body?.commitHash || req.query.commitHash) as string;

    if (!commitHash) {
      res.status(400).json({ success: false, error: 'Body field commitHash is required' });
      return;
    }

    const result = await revertCommit(projectPath, commitHash);
    res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    const statusCode = err.conflicted ? 409 : 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Failed to revert commit',
      conflicted: !!err.conflicted,
    });
  }
}

/**
 * Express handler for POST /restore-preview
 */
export async function handleRestorePreview(req: Request, res: Response): Promise<void> {
  try {
    const projectPath = ((req.body?.projectPath || req.query.path || process.cwd()) as string);
    const targetRef = req.body?.targetRef as string | undefined;

    const result = await restorePreview(projectPath, targetRef);
    res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to restore preview' });
  }
}

/**
 * Creates and configures the Express router for ArtaStudio Git Engine.
 */
export function createGitRouter(): Router {
  const router = express.Router();

  router.get('/history', handleGetCommitHistory);
  router.get('/commits', handleGetCommitHistory);
  router.get('/diff/:commitHash', handleGetCommitDiff);
  router.post('/preview', handlePreviewAtCommit);
  router.post('/revert', handleRevertCommit);
  router.post('/restore-preview', handleRestorePreview);

  return router;
}

export const gitRouter = createGitRouter();
export default gitRouter;
