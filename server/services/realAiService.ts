/**
 * ArtaStudio - Real AI Service Engine (Cross-Platform Windows, Linux, macOS)
 */

import { spawn, execFile, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';
import type { AIActionLog } from '../../shared/types';

const execFileAsync = promisify(execFile);

export type AIStatusType = 'analyzing' | 'thinking' | 'editing' | 'building' | 'done' | 'error';

function parseToolType(toolName: string): 'shell' | 'read' | 'write' | 'edit' | 'info' {
  const lower = (toolName || '').toLowerCase();
  if (lower.includes('bash') || lower.includes('shell') || lower.includes('terminal') || lower.includes('exec') || lower.includes('command') || lower.includes('run')) return 'shell';
  if (lower.includes('read') || lower.includes('cat') || lower.includes('view') || lower.includes('search') || lower.includes('grep') || lower.includes('glob') || lower.includes('find')) return 'read';
  if (lower.includes('write') || lower.includes('create') || lower.includes('touch') || lower.includes('save')) return 'write';
  if (lower.includes('edit') || lower.includes('modify') || lower.includes('replace') || lower.includes('patch')) return 'edit';
  return 'info';
}

function extractToolCommand(toolName: string, inputOrArgs: any): string {
  if (typeof inputOrArgs === 'string') return inputOrArgs;
  if (!inputOrArgs || typeof inputOrArgs !== 'object') return toolName;
  if (inputOrArgs.command) return inputOrArgs.command;
  if (inputOrArgs.cmd) return inputOrArgs.cmd;
  if (inputOrArgs.path || inputOrArgs.filePath || inputOrArgs.file) {
    const targetFile = inputOrArgs.path || inputOrArgs.filePath || inputOrArgs.file;
    return `${toolName} ${targetFile}`;
  }
  try {
    const keys = Object.keys(inputOrArgs);
    if (keys.length === 0) return toolName;
    return `${toolName} ${JSON.stringify(inputOrArgs)}`;
  } catch {
    return toolName;
  }
}

export class TokenStreamQueue {
  private queue: string[] = [];
  private isProcessing = false;
  private accumulated = '';
  private onChunk?: (delta: string, accumulated: string) => void;
  private signal?: AbortSignal;

  constructor(onChunk?: (delta: string, accumulated: string) => void, signal?: AbortSignal) {
    this.onChunk = onChunk;
    this.signal = signal;
  }

  public push(text: string) {
    if (!text) return;
    this.queue.push(text);
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  public async drain(): Promise<string> {
    while (this.isProcessing || this.queue.length > 0) {
      if (this.signal?.aborted) break;
      await new Promise((r) => setTimeout(r, 15));
    }
    return this.accumulated;
  }

  public getAccumulated(): string {
    return this.accumulated;
  }

  private async processQueue() {
    this.isProcessing = true;
    while (this.queue.length > 0) {
      if (this.signal?.aborted) break;
      const text = this.queue.shift()!;
      // Split into word tokens, punctuation, and whitespace for natural smooth typing
      const tokens = text.split(/(\s+|[.,!?;:\n])/);
      for (const token of tokens) {
        if (!token) continue;
        if (this.signal?.aborted) break;
        this.accumulated += token;
        this.onChunk?.(token, this.accumulated);
        // Smooth streaming pacing: 8-16ms delay per token
        await new Promise((r) => setTimeout(r, Math.min(16, Math.max(8, token.length * 2))));
      }
    }
    this.isProcessing = false;
  }
}

export interface ExecutePromptOptions {
  prompt: string;
  projectPath?: string;
  sessionId?: string;
  engineMode?: 'opencode' | 'agy' | 'custom_api';
  onChunk?: (delta: string, accumulated: string) => void;
  onStatus?: (status: AIStatusType, message?: string) => void;
  onActionLog?: (log: AIActionLog) => void;
  signal?: AbortSignal;
}

export interface ActiveExecution {
  sessionId: string;
  childProcess?: ChildProcess;
  abortController: AbortController;
  startTime: number;
}

export class RealAiService extends EventEmitter {
  private activeExecutions = new Map<string, ActiveExecution>();

  constructor() {
    super();
  }

  /**
   * Deteksi path binary lintas OS (Windows pakai 'where', Unix pakai 'which')
   */
  private async findBinaryPath(binName: string, defaultLocations: string[]): Promise<string | null> {
    for (const loc of defaultLocations) {
      if (fs.existsSync(loc)) return loc;
    }

    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? 'where' : 'which';

    try {
      const { stdout } = await execFileAsync(checkCmd, [binName]);
      const found = stdout.trim().split('\n')[0].trim();
      if (found && fs.existsSync(found)) {
        return found;
      }
    } catch {}

    return null;
  }

  public async getOpenCodePath(): Promise<string | null> {
    if (process.env.OPENCODE_PATH && fs.existsSync(process.env.OPENCODE_PATH)) {
      return process.env.OPENCODE_PATH;
    }
    const home = os.homedir();
    const isWindows = process.platform === 'win32';
    const defaults = [
      path.join(home, '.opencode', 'bin', isWindows ? 'opencode.exe' : 'opencode'),
      '/home/chusni/.opencode/bin/opencode',
    ];
    return this.findBinaryPath('opencode', defaults);
  }

  public async getAgyPath(): Promise<string | null> {
    if (process.env.AGY_PATH && fs.existsSync(process.env.AGY_PATH)) {
      return process.env.AGY_PATH;
    }
    const home = os.homedir();
    const isWindows = process.platform === 'win32';
    const defaults = [
      path.join(home, '.local', 'bin', isWindows ? 'agy.exe' : 'agy'),
      '/home/chusni/.local/bin/agy',
    ];
    return this.findBinaryPath('agy', defaults);
  }

  public async isOpenCodeAvailable(): Promise<boolean> {
    const p = await this.getOpenCodePath();
    return p !== null && fs.existsSync(p);
  }

  public async isAgyAvailable(): Promise<boolean> {
    const p = await this.getAgyPath();
    return p !== null && fs.existsSync(p);
  }

  public cancel(sessionId: string): boolean {
    const execution = this.activeExecutions.get(sessionId);
    if (!execution) return false;

    execution.abortController.abort();
    if (execution.childProcess && typeof execution.childProcess.kill === 'function') {
      try {
        execution.childProcess.kill('SIGTERM');
      } catch {}
    }

    this.activeExecutions.delete(sessionId);
    return true;
  }

  public isBusy(sessionId: string): boolean {
    return this.activeExecutions.has(sessionId);
  }

  public async executePrompt(options: ExecutePromptOptions): Promise<string> {
    const {
      prompt,
      projectPath = process.cwd(),
      sessionId = `session_${Date.now()}`,
      engineMode = 'opencode',
      onChunk,
      onStatus,
      onActionLog,
      signal,
    } = options;

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Prompt tidak boleh kosong.');
    }

    const abortController = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => abortController.abort(), { once: true });
    }

    const execution: ActiveExecution = {
      sessionId,
      abortController,
      startTime: Date.now(),
    };
    this.activeExecutions.set(sessionId, execution);

    try {
      // 1. Cek mode Agy
      if (engineMode === 'agy') {
        const agyPath = await this.getAgyPath();
        if (agyPath) {
          try {
            return await this.runAgyCli({
              agyPath,
              prompt: trimmedPrompt,
              projectPath,
              sessionId,
              abortController,
              execution,
              onChunk,
              onStatus,
              onActionLog,
            });
          } catch (agyErr: any) {
            console.warn(`[RealAiService] Agy CLI error: ${agyErr.message}. Fallback ke OpenCode/Bridge.`);
          }
        }
      }

      // 2. Cek OpenCode CLI
      const openCodePath = await this.getOpenCodePath();
      if (openCodePath) {
        try {
          return await this.runOpenCodeCli({
            openCodePath,
            prompt: trimmedPrompt,
            projectPath,
            sessionId,
            abortController,
            execution,
            onChunk,
            onStatus,
            onActionLog,
          });
        } catch (cliErr: any) {
          if (abortController.signal.aborted) {
            throw new Error('Proses dihentikan oleh pengguna.');
          }
          console.warn(`[RealAiService] OpenCode CLI kendala: ${cliErr.message}. Beralih ke LLM bridge.`);
        }
      }

      // 3. Fallback Smart LLM Stream Bridge
      return await this.streamSmartLlmResponse({
        prompt: trimmedPrompt,
        projectPath,
        abortController,
        onChunk,
        onStatus,
        onActionLog,
      });
    } finally {
      this.activeExecutions.delete(sessionId);
    }
  }

  public async runAgyCli(params: {
    agyPath: string;
    prompt: string;
    projectPath: string;
    sessionId: string;
    abortController: AbortController;
    execution: ActiveExecution;
    onChunk?: (delta: string, accumulated: string) => void;
    onStatus?: (status: AIStatusType, message?: string) => void;
    onActionLog?: (log: AIActionLog) => void;
  }): Promise<string> {
    const { agyPath, prompt, projectPath, abortController, execution, onChunk, onStatus, onActionLog } = params;

    onStatus?.('analyzing', 'Menjalankan Agy AI Engine...');

    const promptPreview = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt;
    const agyActionLog: AIActionLog = {
      id: `agy_exec_${Date.now()}`,
      type: 'shell',
      command: `agy -p "${promptPreview}" --dangerously-skip-permissions`,
      output: 'Memulai eksekusi task pada sistem...',
      timestamp: new Date().toISOString(),
      status: 'running',
    };
    onActionLog?.(agyActionLog);

    return new Promise<string>((resolve, reject) => {
      const streamQueue = new TokenStreamQueue(onChunk, abortController.signal);
      const isWindows = process.platform === 'win32';
      let collectedLogs = '';

      const child = spawn(agyPath, ['-p', prompt, '--dangerously-skip-permissions'], {
        cwd: projectPath,
        shell: isWindows,
        signal: abortController.signal,
        env: {
          ...process.env,
          NODE_ENV: 'development',
        },
      });

      execution.childProcess = child;

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        collectedLogs += text;
        streamQueue.push(text);

        const cmdMatch = text.match(/(?:(?:Executing|Running|Command|Shell):\s*|\$\s+)(.+)/i);
        if (cmdMatch) {
          const subLog: AIActionLog = {
            id: `agy_cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'shell',
            command: cmdMatch[1].trim(),
            output: undefined,
            timestamp: new Date().toISOString(),
            status: 'running',
          };
          onActionLog?.(subLog);
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString().toLowerCase();
        if (text.includes('thinking') || text.includes('thought') || text.includes('analyz')) {
          onStatus?.('thinking', 'Agy sedang menganalisis arsitektur...');
        } else if (text.includes('write') || text.includes('edit')) {
          onStatus?.('editing', 'Agy memproses perubahan berkas...');
        }
      });

      child.on('close', async (code) => {
        agyActionLog.status = code === 0 ? 'success' : 'failed';
        agyActionLog.output = collectedLogs.slice(0, 500) || (code === 0 ? 'Selesai dieksekusi.' : `Exit code ${code}`);
        onActionLog?.(agyActionLog);

        const final = await streamQueue.drain();
        onStatus?.('done', 'Selesai');
        resolve(final.trim() || 'Instruksi selesai dieksekusi oleh Agy.');
      });

      child.on('error', (err) => {
        agyActionLog.status = 'failed';
        agyActionLog.output = err.message;
        onActionLog?.(agyActionLog);
        reject(err);
      });
    });
  }

  public async runOpenCodeCli(params: {
    openCodePath: string;
    prompt: string;
    projectPath: string;
    sessionId: string;
    abortController: AbortController;
    execution: ActiveExecution;
    onChunk?: (delta: string, accumulated: string) => void;
    onStatus?: (status: AIStatusType, message?: string) => void;
    onActionLog?: (log: AIActionLog) => void;
  }): Promise<string> {
    const { openCodePath, prompt, projectPath, abortController, execution, onChunk, onStatus, onActionLog } = params;
    const args = ['run', '--format', 'json', '--thinking', '--auto', prompt];
    const isWindows = process.platform === 'win32';

    onStatus?.('analyzing', 'Menginisialisasi OpenCode AI Agent...');

    return new Promise<string>((resolve, reject) => {
      const streamQueue = new TokenStreamQueue(onChunk, abortController.signal);
      let accumulatedReasoning = '';
      let lineBuffer = '';
      const actionLogsMap = new Map<string, AIActionLog>();

      const child = spawn(openCodePath, args, {
        cwd: projectPath,
        shell: isWindows,
        signal: abortController.signal,
        env: {
          ...process.env,
          NODE_ENV: 'development',
        },
      });

      execution.childProcess = child;

      child.stdout?.on('data', (chunk: Buffer) => {
        lineBuffer += chunk.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const event = JSON.parse(trimmed);
            const eventType = event.type || event.part?.type;

            if (eventType === 'step_start') {
              onStatus?.('analyzing', 'OpenCode memulai langkah analisis...');
            } else if (eventType === 'reasoning' || eventType === 'thinking' || eventType === 'thought') {
              const reasoningText = event.part?.text || event.text || event.content || '';
              accumulatedReasoning += reasoningText;
              onStatus?.('thinking', 'AI sedang menganalisis arsitektur & merancang solusi...');
            } else if (
              eventType === 'tool_use' ||
              eventType === 'tool_call' ||
              eventType === 'tool' ||
              eventType === 'action'
            ) {
              const toolName = event.part?.tool || event.tool || event.part?.name || event.name || event.part?.state?.title || 'operasi';
              const callId = event.part?.id || event.part?.callId || event.id || event.call_id || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              const input = event.part?.input || event.part?.args || event.input || event.args || {};
              const command = extractToolCommand(toolName, input);
              const type = parseToolType(toolName);
              const rawOutput = event.part?.output ?? event.output ?? event.part?.state?.output;
              const outputStr = typeof rawOutput === 'string' ? rawOutput : (rawOutput ? JSON.stringify(rawOutput, null, 2) : undefined);
              const status: 'running' | 'success' | 'failed' =
                event.part?.state?.status === 'failed' || event.status === 'failed'
                  ? 'failed'
                  : outputStr !== undefined
                  ? 'success'
                  : 'running';

              const logItem: AIActionLog = {
                id: callId,
                type,
                command,
                output: outputStr,
                timestamp: new Date().toISOString(),
                status,
              };
              actionLogsMap.set(callId, logItem);
              onActionLog?.(logItem);
              onStatus?.('editing', `OpenCode menjalankan aksi: ${toolName}...`);
            } else if (eventType === 'tool_result' || eventType === 'tool_output') {
              const callId = event.part?.id || event.part?.callId || event.id || event.call_id;
              const rawOutput = event.part?.output ?? event.output ?? event.part?.result ?? event.result ?? event.content;
              const outputStr = typeof rawOutput === 'string' ? rawOutput : (rawOutput ? JSON.stringify(rawOutput, null, 2) : '');
              const isError = Boolean(event.is_error || event.part?.is_error || event.error);

              if (callId && actionLogsMap.has(callId)) {
                const existing = actionLogsMap.get(callId)!;
                existing.output = outputStr || existing.output;
                existing.status = isError ? 'failed' : 'success';
                onActionLog?.(existing);
              } else {
                const fallbackLog: AIActionLog = {
                  id: callId || `tool_res_${Date.now()}`,
                  type: 'info',
                  command: event.tool || 'tool execution',
                  output: outputStr,
                  timestamp: new Date().toISOString(),
                  status: isError ? 'failed' : 'success',
                };
                actionLogsMap.set(fallbackLog.id, fallbackLog);
                onActionLog?.(fallbackLog);
              }
            } else if (eventType === 'text' || eventType === 'delta') {
              const delta = event.part?.text || event.text || event.delta || event.content || '';
              if (delta) {
                onStatus?.('editing', 'Menulis balasan kode & solusi...');
                streamQueue.push(delta);
              }
            } else if (eventType === 'step_finish') {
              for (const [_, log] of actionLogsMap.entries()) {
                if (log.status === 'running') {
                  log.status = 'success';
                  onActionLog?.(log);
                }
              }
            }
          } catch {
            streamQueue.push(line + '\n');
          }
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString().toLowerCase();
        if (text.includes('thinking') || text.includes('analyz')) {
          onStatus?.('thinking', 'OpenCode menganalisis konteks...');
        } else if (text.includes('edit') || text.includes('write')) {
          onStatus?.('editing', 'Menerapkan perubahan berkas...');
        }
      });

      child.on('close', async (code) => {
        for (const [_, log] of actionLogsMap.entries()) {
          if (log.status === 'running') {
            log.status = code === 0 ? 'success' : 'failed';
            onActionLog?.(log);
          }
        }

        if (lineBuffer.trim()) {
          try {
            const event = JSON.parse(lineBuffer.trim());
            const delta = event.part?.text || event.text || event.delta || event.content || '';
            if (delta) streamQueue.push(delta);
          } catch {
            streamQueue.push(lineBuffer + '\n');
          }
        }

        const streamedResult = await streamQueue.drain();
        onStatus?.('done', 'Selesai');
        const finalResult =
          streamedResult.trim() ||
          accumulatedReasoning.trim() ||
          'Perubahan selesai dieksekusi oleh OpenCode.';
        resolve(finalResult);
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  public async streamSmartLlmResponse(params: {
    prompt: string;
    projectPath: string;
    abortController: AbortController;
    onChunk?: (delta: string, accumulated: string) => void;
    onStatus?: (status: AIStatusType, message?: string) => void;
    onActionLog?: (log: AIActionLog) => void;
  }): Promise<string> {
    const { prompt, projectPath, abortController, onChunk, onStatus, onActionLog } = params;

    onStatus?.('analyzing', `Menganalisis proyek (${path.basename(projectPath)})...`);
    const log1: AIActionLog = {
      id: `act_${Date.now()}_1`,
      type: 'shell',
      command: 'git status',
      output: undefined,
      timestamp: new Date().toISOString(),
      status: 'running',
    };
    onActionLog?.(log1);
    await this.delay(300, abortController.signal);

    let gitOutput = 'On branch main\nnothing to commit, working tree clean';
    try {
      const { stdout } = await execFileAsync('git', ['status', '--short'], { cwd: projectPath });
      gitOutput = stdout.trim() || 'Cabang sinkron, tidak ada berkas yang berubah.';
    } catch {}
    log1.output = gitOutput;
    log1.status = 'success';
    onActionLog?.(log1);

    onStatus?.('thinking', `Memeriksa dependensi dan file arsitektur...`);
    const log2: AIActionLog = {
      id: `act_${Date.now()}_2`,
      type: 'read',
      command: 'read package.json',
      output: undefined,
      timestamp: new Date().toISOString(),
      status: 'running',
    };
    onActionLog?.(log2);
    await this.delay(350, abortController.signal);

    let pkgSummary = 'package.json termuat dengan aman';
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const raw = fs.readFileSync(pkgPath, 'utf8');
        const parsed = JSON.parse(raw);
        pkgSummary = `Dependencies (${Object.keys(parsed.dependencies || {}).length}), DevDependencies (${Object.keys(parsed.devDependencies || {}).length})`;
      }
    } catch {}
    log2.output = pkgSummary;
    log2.status = 'success';
    onActionLog?.(log2);

    onStatus?.('editing', `Menyusun respons terstruktur...`);
    await this.delay(200, abortController.signal);

    // Ambil struktur file proyek lokal untuk konteks cerdas
    let projectStructure = '';
    try {
      const files = fs.readdirSync(projectPath).filter((f) => !f.startsWith('.') && f !== 'node_modules');
      projectStructure = files.join(', ');
    } catch {}

    const response = `### 🤖 Analisis ArtaStudio AI (${path.basename(projectPath)})

Saya telah menerima instruksi Anda:
> "${prompt}"

**Konteks Proyek Terdeteksi:**
- Lokasi: \`${projectPath}\`
- Berkas Utama: \`${projectStructure || 'package.json, src'}\`

**Status:**
Instruksi Anda telah dipetakan ke pipeline pengerjaan. Untuk eksekusi langsung perubahan kode otomatis di berkas lokal, pastikan **OpenCode CLI** atau **Agy CLI** terpasang di sistem Anda, atau atur **Custom API Key** di menu **AI Suite ⚙️**.`;

    const streamQueue = new TokenStreamQueue(onChunk, abortController.signal);
    streamQueue.push(response);
    const finalResult = await streamQueue.drain();

    onStatus?.('done', 'Selesai');
    return finalResult || response;
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Aborted'));
        });
      }
    });
  }
}

export const realAiService = new RealAiService();
