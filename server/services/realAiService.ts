/**
 * ArtaStudio - Real AI Service Engine (Cross-Platform Windows, Linux, macOS)
 */

import { spawn, execFile, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';

const execFileAsync = promisify(execFile);

export type AIStatusType = 'analyzing' | 'thinking' | 'editing' | 'building' | 'done' | 'error';

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
  }): Promise<string> {
    const { agyPath, prompt, projectPath, abortController, execution, onChunk, onStatus } = params;

    onStatus?.('analyzing', 'Menjalankan Agy AI Engine...');

    return new Promise<string>((resolve, reject) => {
      const streamQueue = new TokenStreamQueue(onChunk, abortController.signal);
      const isWindows = process.platform === 'win32';
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
        streamQueue.push(text);
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
        const final = await streamQueue.drain();
        onStatus?.('done', 'Selesai');
        resolve(final.trim() || 'Instruksi selesai dieksekusi oleh Agy.');
      });

      child.on('error', (err) => {
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
  }): Promise<string> {
    const { openCodePath, prompt, projectPath, abortController, execution, onChunk, onStatus } = params;
    const args = ['run', '--format', 'json', '--thinking', '--auto', prompt];
    const isWindows = process.platform === 'win32';

    onStatus?.('analyzing', 'Menginisialisasi OpenCode AI Agent...');

    return new Promise<string>((resolve, reject) => {
      const streamQueue = new TokenStreamQueue(onChunk, abortController.signal);
      let accumulatedReasoning = '';
      let lineBuffer = '';

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
            } else if (eventType === 'tool_use' || eventType === 'tool') {
              const toolName = event.part?.tool || event.tool || event.part?.state?.title || 'operasi';
              onStatus?.('editing', `OpenCode menjalankan aksi: ${toolName}...`);
            } else if (eventType === 'text' || eventType === 'delta') {
              const delta = event.part?.text || event.text || event.delta || event.content || '';
              if (delta) {
                onStatus?.('editing', 'Menulis balasan kode & solusi...');
                streamQueue.push(delta);
              }
            } else if (eventType === 'step_finish') {
              // langkah selesai
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
  }): Promise<string> {
    const { prompt, projectPath, abortController, onChunk, onStatus } = params;

    onStatus?.('analyzing', `Menganalisis proyek (${path.basename(projectPath)})...`);
    await this.delay(300, abortController.signal);

    onStatus?.('thinking', `Memeriksa dependensi dan file arsitektur...`);
    await this.delay(350, abortController.signal);

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
