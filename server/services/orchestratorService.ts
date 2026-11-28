import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { WorkerOrchestrationState, WorkerOrchestrationStatus } from '../../shared/types';
import { terminalManager, toProjectKey } from './terminalManager';
import { broadcastWebSocketEvent } from '../ws';

const TASKS_DIR = path.join(os.tmpdir(), 'artastudio-tasks');
const MAX_BUFFER_CHARS = 16 * 1024;
const MAX_SEEN_HASHES = 200;

const projectWorkerStatuses = new Map<string, Map<number, WorkerOrchestrationStatus>>();
const sessionRollingBuffers = new Map<string, string>();
const seenBlockHashes = new Set<string>();

function ensureTasksDir(): void {
  if (!fs.existsSync(TASKS_DIR)) {
    fs.mkdirSync(TASKS_DIR, { recursive: true });
  }
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function recordHashIfNew(text: string): boolean {
  const hash = sha256(text.trim());
  if (seenBlockHashes.has(hash)) {
    return false;
  }
  if (seenBlockHashes.size >= MAX_SEEN_HASHES) {
    const oldest = seenBlockHashes.values().next().value;
    if (oldest) seenBlockHashes.delete(oldest);
  }
  seenBlockHashes.add(hash);
  return true;
}

export function clampWorkerId(workerId: number): number {
  const parsed = Number.isFinite(workerId) ? Math.trunc(workerId) : 1;
  return Math.min(Math.max(parsed, 1), 32);
}

function getOrCreateProjectStatusMap(projectKey: string): Map<number, WorkerOrchestrationStatus> {
  let map = projectWorkerStatuses.get(projectKey);
  if (!map) {
    map = new Map<number, WorkerOrchestrationStatus>();
    projectWorkerStatuses.set(projectKey, map);
  }
  return map;
}

function setWorkerStatus(projectKey: string, entry: WorkerOrchestrationStatus): void {
  const map = getOrCreateProjectStatusMap(projectKey);
  map.set(entry.workerId, entry);
}

export function getProjectWorkerStatuses(projectPath: string): WorkerOrchestrationStatus[] {
  const resolved = path.resolve(projectPath || process.cwd());
  const projectKey = toProjectKey(resolved);
  const map = projectWorkerStatuses.get(projectKey);
  if (!map) return [];
  return Array.from(map.values()).sort((a, b) => a.workerId - b.workerId);
}

export function stripAnsiSequences(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function isTemplatePlaceholderBlock(blockText: string): boolean {
  return (
    blockText.includes('<daftar path') ||
    blockText.includes('# worker-1 .. worker-32') ||
    blockText.includes('Protokol Orkestrasi Pemikir') ||
    blockText.includes('<ringkasan tujuan teknis')
  );
}

export interface DispatchWorkerInput {
  projectPath: string;
  workerId: number;
  task: string;
  agent?: string;
  autoLaunchAgent?: boolean;
}

export interface DispatchWorkerResult {
  success: boolean;
  projectPath: string;
  projectKey: string;
  workerId: number;
  sessionId: string;
  taskFile: string;
  status: WorkerOrchestrationStatus;
}

export function dispatchToWorker(input: DispatchWorkerInput): DispatchWorkerResult {
  const resolvedProject = path.resolve(input.projectPath || process.cwd());
  const projectKey = toProjectKey(resolvedProject);
  const workerId = clampWorkerId(input.workerId);
  const sessionId = `${projectKey}__worker_${workerId}`;
  const cleanTask = (input.task || '').trim();
  const cleanAgent = input.agent && /^(agy|opencode|commandcode|claude|bash)$/i.test(input.agent.trim())
    ? input.agent.trim().toLowerCase()
    : undefined;
  const resolvedAgent =
    input.agent !== 'bash' && input.autoLaunchAgent !== false ? (cleanAgent || 'agy') : cleanAgent;

  ensureTasksDir();
  const taskFile = path.join(TASKS_DIR, `${projectKey}_worker_${workerId}_${Date.now()}.md`);
  const taskDocument = [
    `# Tugas Delegasi ArtaStudio — Worker ${workerId}`,
    `- **Proyek:** ${resolvedProject}`,
    `- **Worker ID:** worker-${workerId}`,
    resolvedAgent ? `- **Agent CLI:** ${resolvedAgent}` : null,
    `- **Waktu Dispatch:** ${new Date().toISOString()}`,
    '',
    '[DISPATCH TO WORKER]',
    cleanTask,
    '[/DISPATCH TO WORKER]',
    '',
    '## Instruksi Pelaporan Otomatis (Wajib)',
    `Setelah selesai (atau jika terblokir/gagal), laporkan hasil ke Pemikir menggunakan salah satu cara berikut:`,
    '1. Jalankan CLI:',
    `   \`artastudio report --worker ${workerId} --status DONE --summary "Ringkasan perubahan & hasil test/build"\``,
    '2. Atau cetak blok laporan terstruktur:',
    '```markdown',
    '[WORKER REPORT]',
    `WORKER_ID: worker-${workerId}`,
    'STATUS: DONE',
    'FILES_CHANGED:',
    '  - (daftar file yang diubah)',
    'CHECKS_RUN:',
    '  - (hasil typecheck/test/build)',
    'BLOCKERS:',
    '  - NONE',
    '[/WORKER REPORT]',
    '```',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');

  fs.writeFileSync(taskFile, taskDocument, 'utf8');

  const alreadyExists = terminalManager.hasSession(sessionId);
  const promptText = `Baca & eksekusi tugas Worker ${workerId} di '${taskFile}' sesuai skript.md, lalu laporkan hasil ke Pemikir.`;

  const singleLinePreview = cleanTask.replace(/\s+/g, ' ').slice(0, 140);
  const updatedAt = new Date().toISOString();
  const statusEntry: WorkerOrchestrationStatus = {
    workerId,
    status: 'working',
    summary: singleLinePreview || `Menjalankan tugas Worker ${workerId}`,
    updatedAt,
    taskPreview: singleLinePreview,
  };
  setWorkerStatus(projectKey, statusEntry);

  if (!alreadyExists) {
    if (resolvedAgent === 'agy' && input.autoLaunchAgent !== false) {
      terminalManager.createSession(
        sessionId,
        resolvedProject,
        undefined,
        100,
        30,
        `agy --mode accept-edits -i "${promptText}"`,
        { role: 'worker', workerId }
      );
    } else if (resolvedAgent && resolvedAgent !== 'bash' && input.autoLaunchAgent !== false) {
      terminalManager.createSession(
        sessionId,
        resolvedProject,
        undefined,
        100,
        30,
        resolvedAgent,
        { role: 'worker', workerId }
      );
      setTimeout(() => {
        terminalManager.writeIfActive(sessionId, `${promptText}\r`);
      }, 2500);
    } else {
      terminalManager.createSession(
        sessionId,
        resolvedProject,
        undefined,
        100,
        30,
        undefined,
        { role: 'worker', workerId }
      );
      setTimeout(() => {
        terminalManager.writeIfActive(sessionId, `${promptText}\r`);
      }, 400);
    }
  } else {
    const sess = terminalManager.getSession(sessionId);
    if (!sess?.activeAgentCmd && input.autoLaunchAgent !== false && resolvedAgent && resolvedAgent !== 'bash') {
      if (resolvedAgent === 'agy') {
        terminalManager.writeIfActive(sessionId, `agy --mode accept-edits -i "${promptText}"\r`);
        terminalManager.markAgentActive(sessionId, 'agy');
      } else {
        terminalManager.writeIfActive(sessionId, `${resolvedAgent}\r`);
        terminalManager.markAgentActive(sessionId, resolvedAgent);
        setTimeout(() => {
          terminalManager.writeIfActive(sessionId, `${promptText}\r`);
        }, 2500);
      }
    } else {
      terminalManager.writeIfActive(sessionId, `${promptText}\r`);
    }
  }

  broadcastWebSocketEvent('terminal', 'worker:spawn', {
    projectPath: resolvedProject,
    projectKey,
    workerId,
    sessionId,
    status: 'working' as WorkerOrchestrationState,
    taskPreview: singleLinePreview,
    taskFile,
    updatedAt,
  });

  return {
    success: true,
    projectPath: resolvedProject,
    projectKey,
    workerId,
    sessionId,
    taskFile,
    status: statusEntry,
  };
}

export interface ReportToThinkerInput {
  projectPath: string;
  workerId: number;
  status: 'DONE' | 'FAILED' | 'BLOCKED' | string;
  summary: string;
  filesChanged?: string[];
  rawReport?: string;
}

export interface ReportToThinkerResult {
  success: boolean;
  projectPath: string;
  projectKey: string;
  workerId: number;
  status: WorkerOrchestrationState;
  reportFile: string;
  notifiedThinker: boolean;
}

export function reportToThinker(input: ReportToThinkerInput): ReportToThinkerResult {
  const resolvedProject = path.resolve(input.projectPath || process.cwd());
  const projectKey = toProjectKey(resolvedProject);
  const workerId = clampWorkerId(input.workerId);
  const upperStatus = (input.status || 'DONE').toUpperCase();
  const normalizedState: WorkerOrchestrationState =
    upperStatus === 'FAILED' ? 'failed' : upperStatus === 'BLOCKED' ? 'blocked' : 'done';

  const singleLineSummary = (input.summary || `Worker ${workerId} selesai (${upperStatus})`)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);

  ensureTasksDir();
  const reportFile = path.join(TASKS_DIR, `${projectKey}_report_worker_${workerId}_${Date.now()}.md`);
  const reportDoc = [
    `# Laporan Worker ${workerId} -> Pemikir`,
    `- **Proyek:** ${resolvedProject}`,
    `- **Status:** ${upperStatus}`,
    `- **Waktu:** ${new Date().toISOString()}`,
    '',
    '## Ringkasan',
    input.summary || singleLineSummary,
    '',
    input.filesChanged?.length
      ? `## File Diubah\n${input.filesChanged.map((f) => `- ${f}`).join('\n')}\n`
      : '',
    input.rawReport ? `## Laporan Lengkap\n\`\`\`markdown\n${input.rawReport}\n\`\`\`\n` : '',
  ]
    .filter(Boolean)
    .join('\n');

  fs.writeFileSync(reportFile, reportDoc, 'utf8');

  const updatedAt = new Date().toISOString();
  const statusEntry: WorkerOrchestrationStatus = {
    workerId,
    status: normalizedState,
    summary: singleLineSummary,
    updatedAt,
    reportFile,
  };
  setWorkerStatus(projectKey, statusEntry);

  broadcastWebSocketEvent('terminal', 'worker:report', {
    projectPath: resolvedProject,
    projectKey,
    workerId,
    status: normalizedState,
    summary: singleLineSummary,
    reportFile,
    updatedAt,
  });

  const thinkerSessionId = `${projectKey}__thinker`;
  const thinkerLine = `\r[AUTO-REPORT WORKER ${workerId}] STATUS=${upperStatus} | ${singleLineSummary} | Detail: "${reportFile}"\r`;
  const notifiedThinker = terminalManager.writeIfActive(thinkerSessionId, thinkerLine);

  return {
    success: true,
    projectPath: resolvedProject,
    projectKey,
    workerId,
    status: normalizedState,
    reportFile,
    notifiedThinker,
  };
}

function extractWorkerIdsFromDispatch(headerWorkerNum: string | undefined, body: string): number[] {
  const found = new Set<number>();
  if (headerWorkerNum) {
    const n = parseInt(headerWorkerNum, 10);
    if (n >= 1 && n <= 32) found.add(n);
  }

  const workerIdLine = body.match(/WORKER_ID\s*:\s*([^\n]+)/i);
  if (workerIdLine) {
    const tokens = workerIdLine[1].split(/[,;\s]+/);
    for (const tok of tokens) {
      const m = tok.match(/^(?:worker-)?(\d+)$/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 32) found.add(n);
      }
    }
  }

  if (found.size === 0) {
    found.add(1);
  }
  return Array.from(found).sort((a, b) => a - b);
}

function extractAgentFromDispatch(body: string): string | undefined {
  const agentMatch = body.match(/AGENT\s*:\s*([a-zA-Z0-9_-]+)/i);
  if (agentMatch) {
    const val = agentMatch[1].toLowerCase();
    if (['agy', 'opencode', 'commandcode', 'claude'].includes(val)) {
      return val;
    }
  }
  return undefined;
}

function extractReportSummary(body: string): { status: string; summary: string; workerId?: number } {
  const statusMatch = body.match(/STATUS\s*:\s*(DONE|FAILED|BLOCKED)/i);
  const status = statusMatch ? statusMatch[1].toUpperCase() : 'DONE';

  const workerMatch = body.match(/WORKER_ID\s*:\s*(?:worker-)?(\d+)/i);
  const workerId = workerMatch ? parseInt(workerMatch[1], 10) : undefined;

  const summaryMatch = body.match(/SUMMARY\s*:\s*([^\n]+)/i);
  if (summaryMatch) {
    return { status, summary: summaryMatch[1].trim(), workerId };
  }

  const compactLines = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^WORKER_ID\s*:/i.test(l) && !/^STATUS\s*:/i.test(l))
    .slice(0, 4)
    .join(' | ');

  return {
    status,
    summary: compactLines || `Laporan Worker (${status})`,
    workerId,
  };
}

export function handlePtyOutputChunk(sessionId: string, projectPath: string, rawChunk: string): void {
  const cleanChunk = stripAnsiSequences(rawChunk);
  if (!cleanChunk) return;

  let buffer = (sessionRollingBuffers.get(sessionId) || '') + cleanChunk;
  if (buffer.length > MAX_BUFFER_CHARS) {
    buffer = buffer.slice(-MAX_BUFFER_CHARS);
  }

  const isThinker = sessionId.endsWith('__thinker');
  const workerSessionMatch = sessionId.match(/__worker_(\d+)$/);

  if (isThinker) {
    const dispatchRx = /\[DISPATCH TO WORKER(?:\s+(\d+))?\]([\s\S]{20,8000}?)\[\/DISPATCH TO WORKER\]/i;
    let match: RegExpExecArray | null;
    while ((match = dispatchRx.exec(buffer)) !== null) {
      const fullMatch = match[0];
      const headerWorkerNum = match[1];
      const body = match[2];

      buffer = buffer.slice(0, match.index) + buffer.slice(match.index + fullMatch.length);

      if (isTemplatePlaceholderBlock(fullMatch)) continue;
      if (!recordHashIfNew(`dispatch:${fullMatch}`)) continue;

      const workerIds = extractWorkerIdsFromDispatch(headerWorkerNum, body);
      const agent = extractAgentFromDispatch(body);

      for (const wId of workerIds) {
        try {
          dispatchToWorker({
            projectPath,
            workerId: wId,
            task: body.trim(),
            agent,
          });
        } catch (err) {
          console.warn(`[Orchestrator] Gagal auto-dispatch ke Worker ${wId}:`, err);
        }
      }
    }
  } else if (workerSessionMatch) {
    const sessionWorkerId = parseInt(workerSessionMatch[1], 10);
    const reportRx = /\[WORKER REPORT\]([\s\S]{15,8000}?)\[\/WORKER REPORT\]/i;
    let match: RegExpExecArray | null;
    while ((match = reportRx.exec(buffer)) !== null) {
      const fullMatch = match[0];
      const body = match[1];

      buffer = buffer.slice(0, match.index) + buffer.slice(match.index + fullMatch.length);

      if (isTemplatePlaceholderBlock(fullMatch)) continue;
      if (!recordHashIfNew(`report:${sessionId}:${fullMatch}`)) continue;

      const parsed = extractReportSummary(body);
      const targetWorkerId = parsed.workerId && parsed.workerId >= 1 && parsed.workerId <= 32
        ? parsed.workerId
        : sessionWorkerId;

      try {
        reportToThinker({
          projectPath,
          workerId: targetWorkerId,
          status: parsed.status,
          summary: parsed.summary,
          rawReport: body.trim(),
        });
      } catch (err) {
        console.warn(`[Orchestrator] Gagal auto-report dari Worker ${targetWorkerId}:`, err);
      }
    }
  }

  sessionRollingBuffers.set(sessionId, buffer);
}

// Daftarkan watcher ke TerminalManager tanpa membuat siklus import
terminalManager.registerOutputWatcher(handlePtyOutputChunk);
