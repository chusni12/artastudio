/**
 * ArtaStudio - Cloudflare Edge Deployer Service
 * 
 * Modul 6: Layanan deployment 1-klik ke Cloudflare Edge Workers / Pages.
 * Memvalidasi konfigurasi wrangler, menjalankan pre-deploy build,
 * mengeksekusi deployment streaming stdout/stderr, mem-parsing URL worker publik,
 * serta mencatat riwayat deployment secara persisten.
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
import express from 'express';
import type { Request, Response, Router } from 'express';

const execFileAsync = promisify(execFile);

// ============================================================================
// Types & Interfaces
// ============================================================================

export type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'succeeded' | 'failed';

export type DeploymentLogLevel = 'stdout' | 'stderr' | 'info' | 'warn' | 'error';

export interface DeploymentLogEntry {
  timestamp: string;
  level: DeploymentLogLevel;
  message: string;
}

export interface DeploymentRecord {
  id: string;
  projectPath: string;
  commitHash?: string;
  status: DeploymentStatus;
  url?: string;
  logs: DeploymentLogEntry[];
  rawLogs: string[];
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  configFile?: string;
  buildScript?: string;
}

export interface DeployOptions {
  buildScript?: string;
  customDomain?: string;
  env?: Record<string, string>;
  deploymentId?: string;
  // Optional executor overrides for hermetic unit testing
  executor?: {
    runBuild?: (projectPath: string, script: string, onLog: (entry: DeploymentLogEntry) => void) => Promise<boolean>;
    runDeploy?: (projectPath: string, onLog: (entry: DeploymentLogEntry) => void) => Promise<{ success: boolean; workerUrl?: string; error?: string }>;
  };
}

export interface DeployHistoryFilter {
  limit?: number;
  projectPath?: string;
  status?: DeploymentStatus;
}

export interface WranglerConfigCheck {
  exists: boolean;
  configFile?: string;
  configPath?: string;
  format?: 'jsonc' | 'toml' | 'json';
}

// ============================================================================
// Event Emitter & In-Memory / Persistent State
// ============================================================================

export const deployEmitter = new EventEmitter();
deployEmitter.setMaxListeners(0);

const deploymentHistory = new Map<string, DeploymentRecord>();

// Persistence file location
const PERSISTENCE_DIR = path.join(process.cwd(), '.artastudio');
const PERSISTENCE_FILE = path.join(PERSISTENCE_DIR, 'deploy-history.json');

/**
 * Loads existing deployment history from persistent disk storage.
 */
function loadPersistedHistory(): void {
  try {
    if (fs.existsSync(PERSISTENCE_FILE)) {
      const raw = fs.readFileSync(PERSISTENCE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.id) {
            deploymentHistory.set(item.id, item);
          }
        }
      }
    }
  } catch {
    // Ignore corrupted file and start fresh
  }
}

/**
 * Persists current deployment history to disk.
 */
function persistHistory(): void {
  try {
    if (!fs.existsSync(PERSISTENCE_DIR)) {
      fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
    }
    const records = Array.from(deploymentHistory.values());
    fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch {
    // Non-fatal if writing to disk fails
  }
}

// Initialize history on module load
loadPersistedHistory();

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Generates a unique deployment ID with timestamp prefix.
 */
export function generateDeploymentId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `dep_${time}_${rand}`;
}

/**
 * Checks for the presence of Cloudflare Worker configuration:
 * wrangler.jsonc or wrangler.toml (or wrangler.json).
 */
export function checkWranglerConfig(projectPath: string): WranglerConfigCheck {
  const resolved = path.resolve(projectPath);

  const candidates: Array<{ file: string; format: 'jsonc' | 'toml' | 'json' }> = [
    { file: 'wrangler.jsonc', format: 'jsonc' },
    { file: 'wrangler.toml', format: 'toml' },
    { file: 'wrangler.json', format: 'json' },
  ];

  for (const { file, format } of candidates) {
    const fullPath = path.join(resolved, file);
    if (fs.existsSync(fullPath)) {
      return {
        exists: true,
        configFile: file,
        configPath: fullPath,
        format,
      };
    }
  }

  return { exists: false };
}

/**
 * Retrieves the current git commit hash of the target project if available.
 */
export async function getGitCommitHash(projectPath: string): Promise<string | undefined> {
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: projectPath,
      timeout: 5000,
      env: { ...process.env, LANG: 'en_US.UTF-8' },
    });
    return result.stdout.trim();
  } catch {
    return undefined;
  }
}

/**
 * Parses the deployed Cloudflare worker or custom domain URL from wrangler stdout.
 */
export function parseWorkerUrl(output: string, fallbackName?: string): string | undefined {
  if (!output) return undefined;

  // 1. Match explicit https workers.dev URL
  const workersDevMatch = output.match(/https:\/\/[a-zA-Z0-9_\-\.]+\.workers\.dev[^\s)\]]*/i);
  if (workersDevMatch) {
    return workersDevMatch[0].replace(/[\.,;]+$/, '');
  }

  // 2. Match explicit pages.dev URL
  const pagesDevMatch = output.match(/https:\/\/[a-zA-Z0-9_\-\.]+\.pages\.dev[^\s)\]]*/i);
  if (pagesDevMatch) {
    return pagesDevMatch[0].replace(/[\.,;]+$/, '');
  }

  // 3. Match URL following "Deployed to", "Published to", "Visit at", or "Route"
  const publishedMatch = output.match(/(?:deployed to|published to|visit at|route:?|url:?)\s+(https:\/\/[^\s)\]]+)/i);
  if (publishedMatch && publishedMatch[1]) {
    return publishedMatch[1].replace(/[\.,;]+$/, '');
  }

  // 4. Match URL after success checkmark or bullet: (e.g. "Uploaded ... (https://...)")
  const bracketUrlMatch = output.match(/\((https:\/\/[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9_\-\.\/]+)\)/i);
  if (bracketUrlMatch && bracketUrlMatch[1]) {
    return bracketUrlMatch[1].replace(/[\.,;]+$/, '');
  }

  // 5. Match custom domain configured for the worker
  const domainMatch = output.match(/https:\/\/(?:[a-zA-Z0-9_\-]+\.)+artaloka\.com[^\s)\]]*/i);
  if (domainMatch) {
    return domainMatch[0].replace(/[\.,;]+$/, '');
  }

  return undefined;
}

/**
 * Detects the appropriate build script in package.json.
 */
export function detectBuildScript(projectPath: string, requestedScript?: string): string | undefined {
  if (requestedScript) return requestedScript;

  const pkgPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(pkgPath)) return undefined;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const scripts = pkg.scripts || {};

    if (scripts['test:build']) return 'test:build';
    if (scripts['build']) return 'build';
    if (scripts['build:prod']) return 'build:prod';
  } catch {
    // Ignore JSON parse errors
  }

  return undefined;
}

// ============================================================================
// Core Execution Logic
// ============================================================================

/**
 * Appends a log entry to the deployment record and emits live streaming events.
 */
function appendLog(
  record: DeploymentRecord,
  level: DeploymentLogLevel,
  message: string
): void {
  const entry: DeploymentLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  record.logs.push(entry);
  record.rawLogs.push(message);

  deployEmitter.emit(`log:${record.id}`, entry);
}

/**
 * Updates deployment status and notifies listeners.
 */
function updateStatus(
  record: DeploymentRecord,
  status: DeploymentStatus,
  error?: string
): void {
  record.status = status;
  if (error) {
    record.error = error;
  }
  deployEmitter.emit(`status:${record.id}`, {
    id: record.id,
    status,
    error,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Executes the project build command (`npm run <buildScript>`).
 */
async function executeProjectBuild(
  projectPath: string,
  record: DeploymentRecord,
  buildScript: string,
  customRunner?: DeployOptions['executor']
): Promise<boolean> {
  updateStatus(record, 'building');
  appendLog(record, 'info', `[ArtaStudio] Starting build process using script: "npm run ${buildScript}"`);

  if (customRunner?.runBuild) {
    const success = await customRunner.runBuild(projectPath, buildScript, (entry) => {
      appendLog(record, entry.level, entry.message);
    });
    return success;
  }

  return new Promise<boolean>((resolve) => {
    const child = spawn('npm', ['run', buildScript], {
      cwd: projectPath,
      shell: true,
      env: {
        ...process.env,
        CI: 'true',
        FORCE_COLOR: '0',
      },
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim().length > 0) {
          appendLog(record, 'stdout', line);
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim().length > 0) {
          appendLog(record, 'stderr', line);
        }
      }
    });

    child.on('error', (err) => {
      appendLog(record, 'error', `[ArtaStudio Build Error] ${err.message}`);
      resolve(false);
    });

    child.on('close', (code) => {
      if (stdoutBuffer.trim().length > 0) {
        appendLog(record, 'stdout', stdoutBuffer);
      }
      if (stderrBuffer.trim().length > 0) {
        appendLog(record, 'stderr', stderrBuffer);
      }

      if (code === 0) {
        appendLog(record, 'info', `[ArtaStudio] Build completed successfully (exit code 0)`);
        resolve(true);
      } else {
        appendLog(record, 'error', `[ArtaStudio] Build failed with exit code ${code}`);
        resolve(false);
      }
    });
  });
}

/**
 * Executes `npx wrangler deploy` and captures streaming stdout/stderr.
 */
async function executeWranglerDeploy(
  projectPath: string,
  record: DeploymentRecord,
  customRunner?: DeployOptions['executor']
): Promise<{ success: boolean; workerUrl?: string; error?: string }> {
  updateStatus(record, 'deploying');
  appendLog(record, 'info', `[ArtaStudio] Launching Cloudflare Edge deploy: "npx wrangler deploy"`);

  if (customRunner?.runDeploy) {
    const result = await customRunner.runDeploy(projectPath, (entry) => {
      appendLog(record, entry.level, entry.message);
    });
    return result;
  }

  return new Promise((resolve) => {
    const child = spawn('npx', ['wrangler', 'deploy'], {
      cwd: projectPath,
      shell: true,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
    });

    let fullOutput = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      fullOutput += text;
      stdoutBuffer += text;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim().length > 0) {
          appendLog(record, 'stdout', line);
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      fullOutput += text;
      stderrBuffer += text;
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim().length > 0) {
          appendLog(record, 'stderr', line);
        }
      }
    });

    child.on('error', (err) => {
      const errorMsg = `Failed to spawn wrangler: ${err.message}`;
      appendLog(record, 'error', `[ArtaStudio Deploy Error] ${errorMsg}`);
      resolve({ success: false, error: errorMsg });
    });

    child.on('close', (code) => {
      if (stdoutBuffer.trim().length > 0) {
        appendLog(record, 'stdout', stdoutBuffer);
      }
      if (stderrBuffer.trim().length > 0) {
        appendLog(record, 'stderr', stderrBuffer);
      }

      if (code === 0) {
        const detectedUrl = parseWorkerUrl(fullOutput);
        appendLog(
          record,
          'info',
          `[ArtaStudio] Cloudflare deployment successful! Worker URL: ${detectedUrl || 'Pending URL discovery'}`
        );
        resolve({ success: true, workerUrl: detectedUrl });
      } else {
        const errorMsg = `wrangler deploy exited with error code ${code}`;
        appendLog(record, 'error', `[ArtaStudio Deploy Error] ${errorMsg}`);
        resolve({ success: false, error: errorMsg });
      }
    });
  });
}

// ============================================================================
// Primary Service API: deployToCloudflare
// ============================================================================

/**
 * 1. deployToCloudflare(projectPath: string, options?: DeployOptions)
 *
 * Full 1-Click Deployment Orchestrator:
 * - Validates wrangler.jsonc or wrangler.toml existence.
 * - Inspects Git commit hash for auditing.
 * - Executes pre-deployment build (e.g., `npm run test:build` or `npm run build`).
 * - Executes `npx wrangler deploy`.
 * - Captures real-time streaming logs.
 * - Parses public worker URL output.
 * - Persists deployment record to history.
 */
export async function deployToCloudflare(
  projectPath: string = process.cwd(),
  options: DeployOptions = {}
): Promise<DeploymentRecord> {
  const resolvedPath = path.resolve(projectPath);
  const startTime = Date.now();
  const deploymentId = options.deploymentId || generateDeploymentId();

  // 1. Verify wrangler configuration
  const configCheck = checkWranglerConfig(resolvedPath);
  if (!configCheck.exists) {
    const errorMsg = `Cloudflare configuration not found. Expected wrangler.jsonc or wrangler.toml in: ${resolvedPath}`;
    const failedRecord: DeploymentRecord = {
      id: deploymentId,
      projectPath: resolvedPath,
      status: 'failed',
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: errorMsg,
        },
      ],
      rawLogs: [errorMsg],
      error: errorMsg,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
    deploymentHistory.set(deploymentId, failedRecord);
    persistHistory();
    deployEmitter.emit(`complete:${deploymentId}`, failedRecord);
    throw new Error(errorMsg);
  }

  // 2. Fetch git commit hash for deployment traceability
  const commitHash = await getGitCommitHash(resolvedPath);

  // 3. Initialize deployment record
  const record: DeploymentRecord = {
    id: deploymentId,
    projectPath: resolvedPath,
    commitHash,
    status: 'pending',
    logs: [],
    rawLogs: [],
    startedAt: new Date(startTime).toISOString(),
    configFile: configCheck.configFile,
  };

  deploymentHistory.set(deploymentId, record);
  persistHistory();

  appendLog(
    record,
    'info',
    `[ArtaStudio] Initiating 1-Click Cloudflare Edge Deployment (ID: ${deploymentId})`
  );
  appendLog(record, 'info', `[ArtaStudio] Target project path: ${resolvedPath}`);
  appendLog(record, 'info', `[ArtaStudio] Detected config: ${configCheck.configFile}`);
  if (commitHash) {
    appendLog(record, 'info', `[ArtaStudio] Git commit hash: ${commitHash}`);
  }

  try {
    // 4. Run Project Build
    const buildScript = detectBuildScript(resolvedPath, options.buildScript);
    record.buildScript = buildScript;

    if (buildScript) {
      const buildSuccess = await executeProjectBuild(
        resolvedPath,
        record,
        buildScript,
        options.executor
      );
      if (!buildSuccess) {
        throw new Error(`Project build failed using script "npm run ${buildScript}"`);
      }
    } else {
      appendLog(
        record,
        'warn',
        '[ArtaStudio] No build script detected in package.json. Proceeding directly to wrangler deploy.'
      );
    }

    // 5. Execute Cloudflare Wrangler Deploy
    const deployResult = await executeWranglerDeploy(
      resolvedPath,
      record,
      options.executor
    );

    if (!deployResult.success) {
      throw new Error(deployResult.error || 'wrangler deploy execution failed');
    }

    // 6. Record Success
    const endTime = Date.now();
    record.completedAt = new Date(endTime).toISOString();
    record.durationMs = endTime - startTime;
    record.url = deployResult.workerUrl || options.customDomain;
    updateStatus(record, 'succeeded');

    appendLog(
      record,
      'info',
      `[ArtaStudio] Deployment finished successfully in ${((record.durationMs || 0) / 1000).toFixed(2)}s`
    );
    if (record.url) {
      appendLog(record, 'info', `[ArtaStudio] Live Public Worker URL: ${record.url}`);
    }

    persistHistory();
    deployEmitter.emit(`complete:${record.id}`, record);
    return record;
  } catch (err: any) {
    // 7. Record Failure
    const endTime = Date.now();
    record.completedAt = new Date(endTime).toISOString();
    record.durationMs = endTime - startTime;
    updateStatus(record, 'failed', err.message);

    appendLog(record, 'error', `[ArtaStudio Deployment Failed] ${err.message}`);

    persistHistory();
    deployEmitter.emit(`complete:${record.id}`, record);
    throw err;
  }
}

// ============================================================================
// History & Inspection Helpers
// ============================================================================

/**
 * Retrieves a specific deployment record by ID.
 */
export function getDeploymentById(id: string): DeploymentRecord | undefined {
  return deploymentHistory.get(id);
}

/**
 * Retrieves list of past deployments with optional filters and sorting.
 */
export function getDeploymentHistory(filter: DeployHistoryFilter = {}): DeploymentRecord[] {
  let records = Array.from(deploymentHistory.values());

  if (filter.projectPath) {
    const resolved = path.resolve(filter.projectPath);
    records = records.filter((r) => r.projectPath === resolved);
  }

  if (filter.status) {
    records = records.filter((r) => r.status === filter.status);
  }

  // Sort descending by start time (newest first)
  records.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const limit = Math.max(1, Math.min(filter.limit || 50, 200));
  return records.slice(0, limit);
}

/**
 * Clears in-memory and persisted deployment history (used for testing and maintenance).
 */
export function clearDeploymentHistory(): void {
  deploymentHistory.clear();
  try {
    if (fs.existsSync(PERSISTENCE_FILE)) {
      fs.unlinkSync(PERSISTENCE_FILE);
    }
  } catch {
    // Ignore error
  }
}

// ============================================================================
// Express Route Handlers
// ============================================================================

/**
 * POST /api/deploy/trigger (or /trigger)
 * Triggers a new Cloudflare deployment asynchronously and returns the deploymentId.
 */
export async function handleTriggerDeploy(req: Request, res: Response): Promise<void> {
  try {
    const projectPath = (req.body?.projectPath || req.query.projectPath || process.cwd()) as string;
    const buildScript = req.body?.buildScript as string | undefined;
    const customDomain = req.body?.customDomain as string | undefined;
    const waitForCompletion = req.body?.waitForCompletion === true || req.query.waitForCompletion === 'true';

    const resolved = path.resolve(projectPath);

    // Validate config presence upfront
    const config = checkWranglerConfig(resolved);
    if (!config.exists) {
      res.status(400).json({
        success: false,
        error: `Cloudflare configuration (wrangler.jsonc or wrangler.toml) not found in: ${resolved}`,
      });
      return;
    }

    const deploymentId = generateDeploymentId();

    if (waitForCompletion) {
      // Synchronous wait
      const record = await deployToCloudflare(resolved, {
        deploymentId,
        buildScript,
        customDomain,
      });
      res.status(200).json({
        success: true,
        deploymentId: record.id,
        status: record.status,
        url: record.url,
        durationMs: record.durationMs,
        data: record,
      });
      return;
    }

    // Asynchronous background execution
    // Start deploy process in background
    deployToCloudflare(resolved, {
      deploymentId,
      buildScript,
      customDomain,
    }).catch(() => {
      // Errors are already logged to deployment record & emitter
    });

    res.status(202).json({
      success: true,
      deploymentId,
      status: 'pending',
      message: 'Deployment triggered successfully. Listen on SSE logs for real-time progress.',
      streamUrl: `/api/deploy/logs/${deploymentId}`,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to trigger deployment',
    });
  }
}

/**
 * GET /api/deploy/logs/:deploymentId (or /logs/:deploymentId)
 * Server-Sent Events (SSE) streaming endpoint for live deployment logs.
 */
export function handleDeployLogsSSE(req: Request, res: Response): void {
  const deploymentId = (req.params.deploymentId || req.params.id || req.query.id) as string;

  if (!deploymentId) {
    res.status(400).json({ success: false, error: 'deploymentId parameter is required' });
    return;
  }

  const record = getDeploymentById(deploymentId);
  if (!record) {
    res.status(404).json({ success: false, error: `Deployment record not found: ${deploymentId}` });
    return;
  }

  // Set SSE response headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Handshake greeting
  res.write(`data: ${JSON.stringify({ type: 'connected', deploymentId, status: record.status })}\n\n`);

  // Stream existing historical logs
  for (const log of record.logs) {
    res.write(`data: ${JSON.stringify({ type: 'log', data: log })}\n\n`);
  }

  // If already finished, emit complete and end connection
  if (record.status === 'succeeded' || record.status === 'failed') {
    res.write(`data: ${JSON.stringify({ type: 'complete', data: record })}\n\n`);
    res.end();
    return;
  }

  // Subscriptions for live streaming
  const onLog = (logEntry: DeploymentLogEntry) => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'log', data: logEntry })}\n\n`);
    } catch {
      cleanup();
    }
  };

  const onStatus = (statusUpdate: any) => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'status', data: statusUpdate })}\n\n`);
    } catch {
      cleanup();
    }
  };

  const onComplete = (completedRecord: DeploymentRecord) => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'complete', data: completedRecord })}\n\n`);
      res.end();
    } catch {
      // Ignore
    } finally {
      cleanup();
    }
  };

  // Keep-alive heartbeat comment
  const pingInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      cleanup();
    }
  }, 15000);

  const cleanup = () => {
    clearInterval(pingInterval);
    deployEmitter.off(`log:${deploymentId}`, onLog);
    deployEmitter.off(`status:${deploymentId}`, onStatus);
    deployEmitter.off(`complete:${deploymentId}`, onComplete);
  };

  deployEmitter.on(`log:${deploymentId}`, onLog);
  deployEmitter.on(`status:${deploymentId}`, onStatus);
  deployEmitter.on(`complete:${deploymentId}`, onComplete);

  req.on('close', cleanup);
}

/**
 * GET /api/deploy/history (or /history)
 * Returns the list of past deployments.
 */
export function handleGetDeployHistory(req: Request, res: Response): void {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const projectPath = req.query.projectPath as string | undefined;
    const status = req.query.status as DeploymentStatus | undefined;

    const deployments = getDeploymentHistory({
      limit: isNaN(limit) ? 50 : limit,
      projectPath,
      status,
    });

    res.status(200).json({
      success: true,
      total: deployments.length,
      deployments,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve deployment history',
    });
  }
}

/**
 * GET /api/deploy/status/:deploymentId (or /status/:deploymentId)
 * Returns current status of a deployment record.
 */
export function handleGetDeploymentStatus(req: Request, res: Response): void {
  const deploymentId = (req.params.deploymentId || req.params.id) as string;
  const record = getDeploymentById(deploymentId);

  if (!record) {
    res.status(404).json({ success: false, error: `Deployment not found: ${deploymentId}` });
    return;
  }

  res.status(200).json({
    success: true,
    data: record,
  });
}

// ============================================================================
// Router Factory
// ============================================================================

/**
 * Creates and configures the Express Router for ArtaStudio Deployment Service.
 */
export function createDeployRouter(): Router {
  const router = express.Router();

  // Support both direct subpath and full /api/deploy path
  router.post('/trigger', handleTriggerDeploy);
  router.post('/api/deploy/trigger', handleTriggerDeploy);

  router.get('/logs/:deploymentId', handleDeployLogsSSE);
  router.get('/api/deploy/logs/:deploymentId', handleDeployLogsSSE);

  router.get('/history', handleGetDeployHistory);
  router.get('/api/deploy/history', handleGetDeployHistory);

  router.get('/status/:deploymentId', handleGetDeploymentStatus);
  router.get('/api/deploy/status/:deploymentId', handleGetDeploymentStatus);

  return router;
}

export const deployRouter = createDeployRouter();
export default deployRouter;
