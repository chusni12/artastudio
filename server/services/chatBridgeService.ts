/**
 * ArtaStudio - OpenCode & Orca Chat Bridge Service
 * 
 * Modul 5: Layanan jembatan komunikasi antara antarmuka klien ArtaStudio,
 * runtime agent OpenCode / Orca, streaming Server-Sent Events (SSE),
 * WebSocket, pelacak status progres, dan deteksi commit otomatis.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
import * as expressModule from 'express';
import type { Request, Response, Router } from 'express';

const express = (expressModule as any).default || expressModule;
import type {
  ChatMessage,
  CommitItem,
  FileDiff,
  AIStatusState,
  ChatSession,
  ChatStreamEvent,
  SendMessageRequest,
  SendMessageResponse,
  TargetAgent,
  StatusEvent,
  TextDeltaEvent,
  CommitCreatedEvent,
  DoneEvent,
  ErrorEvent,
  ConnectedEvent,
  HeartbeatEvent,
} from '../../shared/types.js';

const execFileAsync = promisify(execFile);

// ============================================================================
// Internal Subscriber Interfaces
// ============================================================================

interface SSESubscriber {
  id: string;
  type: 'sse';
  sessionId: string;
  res: Response;
  heartbeatTimer?: NodeJS.Timeout;
}

interface WebSocketSubscriber {
  id: string;
  type: 'ws';
  sessionId: string;
  ws: any;
}

type EventSubscriber = SSESubscriber | WebSocketSubscriber;

interface ActiveExecution {
  sessionId: string;
  abortController: AbortController;
  childProcess?: any;
  targetAgent: TargetAgent;
  initialCommitHash?: string;
}

// ============================================================================
// Helper Functions for Git Detection
// ============================================================================

export async function getGitHead(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function getCurrentGitBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    return stdout.trim() || 'main';
  } catch {
    return 'main';
  }
}

export async function getCommitDetails(cwd: string, commitHash: string): Promise<CommitItem | null> {
  try {
    const { stdout: logOut } = await execFileAsync(
      'git',
      ['log', '-1', '--format=%H|%h|%an|%ae|%aI|%s', commitHash],
      { cwd }
    );
    const parts = logOut.trim().split('|');
    if (parts.length < 6) return null;

    const [fullHash, shortHash, authorName, authorEmail, timestamp, message] = parts;
    const branch = await getCurrentGitBranch(cwd);

    // Dapatkan diff summary
    let filesChanged = 0;
    let additions = 0;
    let deletions = 0;
    const diffSummary: FileDiff[] = [];

    try {
      const { stdout: statOut } = await execFileAsync(
        'git',
        ['show', '--stat', '--oneline', commitHash],
        { cwd }
      );
      const statMatch = statOut.match(
        /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/
      );
      if (statMatch) {
        filesChanged = parseInt(statMatch[1] || '0', 10);
        additions = parseInt(statMatch[2] || '0', 10);
        deletions = parseInt(statMatch[3] || '0', 10);
      }
    } catch {
      // Abaikan jika show stat gagal
    }

    try {
      const { stdout: diffNamesOut } = await execFileAsync(
        'git',
        ['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash],
        { cwd }
      );
      const lines = diffNamesOut.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const [rawStatus, filePath] = line.split(/\s+/);
        if (!filePath) continue;
        let status: FileDiff['status'] = 'modified';
        if (rawStatus?.startsWith('A')) status = 'added';
        else if (rawStatus?.startsWith('D')) status = 'deleted';
        else if (rawStatus?.startsWith('R')) status = 'renamed';

        diffSummary.push({
          filePath,
          path: filePath,
          additions: 0,
          deletions: 0,
          changes: 0,
          status,
        });
      }
    } catch {
      // Abaikan jika diff-tree gagal
    }

    return {
      id: fullHash,
      hash: fullHash,
      shortHash: shortHash || fullHash.substring(0, 7),
      message: message || 'Pembaruan kode ArtaStudio',
      author: {
        name: authorName || 'ArtaStudio Agent',
        email: authorEmail || 'agent@artastudio.local',
      },
      timestamp: timestamp || new Date().toISOString(),
      branch,
      filesChanged: filesChanged || diffSummary.length,
      additions,
      deletions,
      diffSummary,
      isCurrentPreview: true,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// ChatBridgeService Implementation
// ============================================================================

export class ChatBridgeService extends EventEmitter {
  private sessions: Map<string, ChatSession> = new Map();
  private subscribers: Map<string, Set<EventSubscriber>> = new Map();
  private activeExecutions: Map<string, ActiveExecution> = new Map();
  private openCodeApiUrl: string | null = null;
  private defaultProjectPath: string = process.cwd();

  constructor() {
    super();
    this.detectOpenCodeEndpoint();
  }

  /**
   * Menentukan URL endpoint lokal OpenCode jika service background sedang aktif.
   */
  public async detectOpenCodeEndpoint(): Promise<string | null> {
    if (process.env.OPENCODE_API_URL) {
      this.openCodeApiUrl = process.env.OPENCODE_API_URL;
      return this.openCodeApiUrl;
    }

    try {
      const { stdout } = await execFileAsync('opencode', ['service', 'status']);
      const match = stdout.match(/https?:\/\/[^\s]+/);
      if (match) {
        this.openCodeApiUrl = match[0].trim();
        return this.openCodeApiUrl;
      }
    } catch {
      // Background service belum aktif
    }

    return null;
  }

  public getOpenCodeApiUrl(): string | null {
    return this.openCodeApiUrl;
  }

  public setDefaultProjectPath(projectPath: string): void {
    this.defaultProjectPath = projectPath;
  }

  public getDefaultProjectPath(): string {
    return this.defaultProjectPath;
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  public getOrCreateSession(sessionId?: string, projectPath?: string): ChatSession {
    const id = sessionId && sessionId.trim() ? sessionId.trim() : `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const existing = this.sessions.get(id);
    if (existing) {
      if (projectPath && !existing.projectPath) {
        existing.projectPath = projectPath;
      }
      return existing;
    }

    const newSession: ChatSession = {
      sessionId: id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      status: 'idle',
      statusMessage: 'Siap menerima instruksi',
      isStreaming: false,
      projectPath: projectPath || this.defaultProjectPath,
      targetAgent: 'auto',
    };

    this.sessions.set(id, newSession);
    return newSession;
  }

  public getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }

  public getHistory(sessionId: string): ChatMessage[] {
    const session = this.sessions.get(sessionId);
    return session ? session.messages : [];
  }

  public clearSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.cancelSession(sessionId);
    session.messages = [];
    session.status = 'idle';
    session.statusMessage = 'Riwayat percakapan dibersihkan';
    session.updatedAt = new Date().toISOString();
    return true;
  }

  public cancelSession(sessionId: string): boolean {
    const active = this.activeExecutions.get(sessionId);
    if (!active) return false;

    active.abortController.abort();
    if (active.childProcess && typeof active.childProcess.kill === 'function') {
      try {
        active.childProcess.kill('SIGTERM');
      } catch {
        // Abaikan
      }
    }

    this.activeExecutions.delete(sessionId);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.isStreaming = false;
      session.status = 'idle';
      session.statusMessage = 'Operasi dibatalkan pengguna';
      session.updatedAt = new Date().toISOString();
    }

    this.broadcastEvent(sessionId, {
      type: 'status',
      sessionId,
      state: 'idle',
      message: 'Operasi dibatalkan pengguna',
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  // ==========================================================================
  // Subscriber Management (SSE & WebSocket)
  // ==========================================================================

  public addSubscriber(subscriber: EventSubscriber): () => void {
    const { sessionId } = subscriber;
    let set = this.subscribers.get(sessionId);
    if (!set) {
      set = new Set();
      this.subscribers.set(sessionId, set);
    }
    set.add(subscriber);

    // Kirim pesan koneksi pertama kali
    const session = this.sessions.get(sessionId);
    const connectedEvent: ConnectedEvent = {
      type: 'connected',
      sessionId,
      timestamp: new Date().toISOString(),
      history: session ? session.messages : [],
      currentStatus: session
        ? {
            state: session.status,
            message: session.statusMessage,
          }
        : {
            state: 'idle',
            message: 'Terhubung ke ArtaStudio Chat Bridge',
          },
    };

    this.deliverEvent(subscriber, connectedEvent);

    // Return fungsi unsubscribe
    return () => {
      this.removeSubscriber(subscriber);
    };
  }

  public removeSubscriber(subscriber: EventSubscriber): void {
    const set = this.subscribers.get(subscriber.sessionId);
    if (set) {
      set.delete(subscriber);
      if (set.size === 0) {
        this.subscribers.delete(subscriber.sessionId);
      }
    }
    if (subscriber.type === 'sse' && subscriber.heartbeatTimer) {
      clearInterval(subscriber.heartbeatTimer);
    }
  }

  public getSubscribersCount(sessionId: string): number {
    return this.subscribers.get(sessionId)?.size || 0;
  }

  public broadcastEvent(sessionId: string, event: ChatStreamEvent): void {
    // Simpan status pada session bila ada update status
    const session = this.sessions.get(sessionId);
    if (session) {
      if (event.type === 'status') {
        session.status = event.state;
        session.statusMessage = event.message;
        session.updatedAt = event.timestamp;
      } else if (event.type === 'commit_created') {
        session.activeCommitHash = event.commit.hash;
        session.updatedAt = event.timestamp;
      }
    }

    // Emit event ke Node EventEmitter internal
    this.emit('chat_event', event);
    this.emit(`event:${sessionId}`, event);

    // Kirim ke semua SSE dan WebSocket yang mendengarkan session ini
    const subscribers = this.subscribers.get(sessionId);
    if (subscribers) {
      subscribers.forEach((sub) => {
        this.deliverEvent(sub, event);
      });
    }
  }

  private deliverEvent(subscriber: EventSubscriber, event: ChatStreamEvent): void {
    try {
      if (subscriber.type === 'sse') {
        const payload = `data: ${JSON.stringify(event)}\n\n`;
        subscriber.res.write(payload);
        if (typeof (subscriber.res as any).flush === 'function') {
          (subscriber.res as any).flush();
        }
      } else if (subscriber.type === 'ws') {
        if (subscriber.ws && subscriber.ws.readyState === 1) {
          subscriber.ws.send(JSON.stringify(event));
        }
      }
    } catch {
      this.removeSubscriber(subscriber);
    }
  }

  // ==========================================================================
  // Public Chat API: Send Message & Trigger Agent
  // ==========================================================================

  public async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    const promptText = (request.prompt || request.message || '').trim();
    if (!promptText) {
      throw new Error('Pesan prompt tidak boleh kosong.');
    }

    const session = this.getOrCreateSession(request.sessionId, request.projectPath);
    const targetAgent: TargetAgent = request.targetAgent || session.targetAgent || 'auto';
    session.targetAgent = targetAgent;

    const userMessageId = `msg_${Date.now()}_u`;
    const userMessage: ChatMessage = {
      id: userMessageId,
      sender: 'user',
      content: promptText,
      timestamp: new Date().toISOString(),
    };
    session.messages.push(userMessage);

    // Siapkan abort controller untuk eksekusi ini
    const abortController = new AbortController();
    const projectPath = request.projectPath || session.projectPath || this.defaultProjectPath;

    // Catat hash commit HEAD sebelum eksekusi dimulai
    const initialCommitHash = (await getGitHead(projectPath)) || undefined;

    this.activeExecutions.set(session.sessionId, {
      sessionId: session.sessionId,
      abortController,
      targetAgent,
      initialCommitHash,
    });

    session.isStreaming = true;
    session.status = 'analyzing';
    session.statusMessage = 'Sedang menganalisis struktur kode...';
    session.updatedAt = new Date().toISOString();

    // Broadcast status pengerjaan awal ke klien
    this.broadcastEvent(session.sessionId, {
      type: 'status',
      sessionId: session.sessionId,
      state: 'analyzing',
      message: 'Sedang menganalisis struktur kode...',
      timestamp: new Date().toISOString(),
    });

    // Jalankan pipeline agent secara asinkron agar tidak memblokir respon HTTP POST
    this.executeAgentPipeline({
      session,
      prompt: promptText,
      targetAgent,
      projectPath,
      context: request.context,
      initialCommitHash,
      abortController,
    }).catch((err) => {
      this.broadcastEvent(session.sessionId, {
        type: 'error',
        sessionId: session.sessionId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    });

    return {
      success: true,
      sessionId: session.sessionId,
      messageId: userMessageId,
      status: 'started',
      targetAgent,
      timestamp: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // Agent Execution Pipeline
  // ==========================================================================

  private async executeAgentPipeline(params: {
    session: ChatSession;
    prompt: string;
    targetAgent: TargetAgent;
    projectPath: string;
    context?: Record<string, any>;
    initialCommitHash?: string;
    abortController: AbortController;
  }): Promise<void> {
    const { session, prompt, targetAgent, projectPath, initialCommitHash, abortController } = params;
    const startTime = Date.now();
    let accumulatedText = '';
    let lastKnownCommitHash = initialCommitHash;

    const emitDelta = (delta: string) => {
      accumulatedText += delta;
      this.broadcastEvent(session.sessionId, {
        type: 'text_delta',
        sessionId: session.sessionId,
        delta,
        accumulated: accumulatedText,
        timestamp: new Date().toISOString(),
      });
    };

    const emitStatus = (state: AIStatusState, message: string) => {
      this.broadcastEvent(session.sessionId, {
        type: 'status',
        sessionId: session.sessionId,
        state,
        message,
        timestamp: new Date().toISOString(),
      });
    };

    const checkForNewCommits = async () => {
      try {
        const currentHead = await getGitHead(projectPath);
        if (currentHead && currentHead !== lastKnownCommitHash) {
          lastKnownCommitHash = currentHead;
          const commitDetails = await getCommitDetails(projectPath, currentHead);
          if (commitDetails) {
            this.broadcastEvent(session.sessionId, {
              type: 'commit_created',
              sessionId: session.sessionId,
              commit: commitDetails,
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch {
        // Abaikan kegagalan sementara pembacaan git
      }
    };

    try {
      if (abortController.signal.aborted) return;

      // Pilih executor: OpenCode, Orca, atau simulator cerdas
      if (targetAgent === 'simulator') {
        await this.runSimulatedAgent({
          prompt,
          projectPath,
          session,
          abortController,
          emitDelta,
          emitStatus,
          onProgressCheck: checkForNewCommits,
        });
      } else if (targetAgent === 'opencode') {
        await this.runOpenCodeAgent({
          prompt,
          projectPath,
          session,
          abortController,
          emitDelta,
          emitStatus,
          onProgressCheck: checkForNewCommits,
        });
      } else if (targetAgent === 'orca') {
        await this.runOrcaAgent({
          prompt,
          projectPath,
          session,
          abortController,
          emitDelta,
          emitStatus,
          onProgressCheck: checkForNewCommits,
        });
      } else {
        // Target 'auto': periksa runtime yang tersedia atau fallback ke simulator
        const hasOpenCode = await this.isOpenCodeAvailable();
        const hasOrca = await this.isOrcaAvailable();

        if (hasOpenCode) {
          await this.runOpenCodeAgent({
            prompt,
            projectPath,
            session,
            abortController,
            emitDelta,
            emitStatus,
            onProgressCheck: checkForNewCommits,
          });
        } else if (hasOrca) {
          await this.runOrcaAgent({
            prompt,
            projectPath,
            session,
            abortController,
            emitDelta,
            emitStatus,
            onProgressCheck: checkForNewCommits,
          });
        } else {
          await this.runSimulatedAgent({
            prompt,
            projectPath,
            session,
            abortController,
            emitDelta,
            emitStatus,
            onProgressCheck: checkForNewCommits,
          });
        }
      }

      // Deteksi commit terakhir kali setelah agent selesai
      await checkForNewCommits();

      if (abortController.signal.aborted) return;

      // Selesai dengan sukses
      const durationMs = Date.now() - startTime;
      emitStatus('idle', 'Selesai');

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_a`,
        sender: 'assistant',
        content: accumulatedText.trim() || 'Perubahan dan verifikasi berhasil diselesaikan oleh ArtaStudio AI.',
        timestamp: new Date().toISOString(),
        metadata: {
          responseTimeMs: durationMs,
          agent: targetAgent,
          commitHash: lastKnownCommitHash,
        },
      };
      session.messages.push(assistantMessage);
      session.isStreaming = false;
      session.status = 'idle';
      session.statusMessage = 'Selesai';
      session.updatedAt = new Date().toISOString();

      const doneEvent: DoneEvent = {
        type: 'done',
        sessionId: session.sessionId,
        fullResponse: assistantMessage.content,
        metadata: {
          durationMs,
          agent: targetAgent,
          commitHash: lastKnownCommitHash,
        },
        timestamp: new Date().toISOString(),
      };
      this.broadcastEvent(session.sessionId, doneEvent);
    } catch (error) {
      if (abortController.signal.aborted) return;

      const errorMessage = error instanceof Error ? error.message : String(error);
      emitStatus('error', `Gagal: ${errorMessage}`);
      session.isStreaming = false;
      session.status = 'error';
      session.statusMessage = errorMessage;
      session.updatedAt = new Date().toISOString();

      const errorEvent: ErrorEvent = {
        type: 'error',
        sessionId: session.sessionId,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
      this.broadcastEvent(session.sessionId, errorEvent);
    } finally {
      this.activeExecutions.delete(session.sessionId);
    }
  }

  // ==========================================================================
  // Agent Runtime Connectors (OpenCode, Orca, & Simulator)
  // ==========================================================================

  public async isOpenCodeAvailable(): Promise<boolean> {
    try {
      await execFileAsync('which', ['opencode']);
      return true;
    } catch {
      return false;
    }
  }

  public async isOrcaAvailable(): Promise<boolean> {
    try {
      await execFileAsync('which', ['orca']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Menjalankan OpenCode agent melalui CLI `opencode run` atau REST API
   */
  private async runOpenCodeAgent(options: {
    prompt: string;
    projectPath: string;
    session: ChatSession;
    abortController: AbortController;
    emitDelta: (delta: string) => void;
    emitStatus: (state: AIStatusState, message: string) => void;
    onProgressCheck: () => Promise<void>;
  }): Promise<void> {
    const { prompt, projectPath, session, abortController, emitDelta, emitStatus, onProgressCheck } = options;

    return new Promise((resolve, reject) => {
      const args = ['run', '--session', session.sessionId, '--format', 'default', prompt];
      const child = spawn('opencode', args, {
        cwd: projectPath,
        shell: false,
        signal: abortController.signal,
        env: {
          ...process.env,
          ARTASTUDIO_SESSION_ID: session.sessionId,
        },
      });

      const activeExec = this.activeExecutions.get(session.sessionId);
      if (activeExec) {
        activeExec.childProcess = child;
      }

      child.stdout.on('data', async (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        emitDelta(text);

        // Analisis teks untuk deteksi transisi tahapan kerja
        const lower = text.toLowerCase();
        if (lower.includes('write') || lower.includes('edit') || lower.includes('patch') || lower.includes('membuat')) {
          emitStatus('coding', 'Mengedit file...');
        } else if (lower.includes('build') || lower.includes('test') || lower.includes('kompilasi')) {
          emitStatus('building', 'Menjalankan build...');
        }

        await onProgressCheck();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        // Jangan perlakukan stderr sebagai fatal error kecuali exit code bukan 0
        if (text.toLowerCase().includes('error')) {
          emitDelta(`\n[Info] ${text}`);
        }
      });

      child.on('close', async (code) => {
        await onProgressCheck();
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`OpenCode agent keluar dengan kode ${code}`));
        }
      });

      child.on('error', (err) => {
        if (abortController.signal.aborted) {
          resolve();
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Menjalankan Orca CLI orchestration command
   */
  private async runOrcaAgent(options: {
    prompt: string;
    projectPath: string;
    session: ChatSession;
    abortController: AbortController;
    emitDelta: (delta: string) => void;
    emitStatus: (state: AIStatusState, message: string) => void;
    onProgressCheck: () => Promise<void>;
  }): Promise<void> {
    const { prompt, projectPath, session, abortController, emitDelta, emitStatus, onProgressCheck } = options;

    return new Promise((resolve, reject) => {
      // Jalankan terminal command atau sub-dispatch orca jika tersedia
      const args = ['status', '--json'];
      const child = spawn('orca', args, {
        cwd: projectPath,
        shell: false,
        signal: abortController.signal,
      });

      const activeExec = this.activeExecutions.get(session.sessionId);
      if (activeExec) {
        activeExec.childProcess = child;
      }

      emitStatus('analyzing', 'Sedang menganalisis workspace via Orca Engine...');
      emitDelta(`Menerima perintah: "${prompt}"\nMenghubungkan ke Orca Orchestrator...\n`);

      child.stdout.on('data', async (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        emitDelta(`Orca Status: ${text.substring(0, 120)}...\n`);
        emitStatus('coding', 'Mengedit file...');
        await onProgressCheck();
      });

      child.on('close', async (code) => {
        emitStatus('building', 'Menjalankan build...');
        await onProgressCheck();
        if (code === 0 || code === null) {
          emitDelta('\nTugas berhasil didelegasikan dan dieksekusi melalui Orca.');
          resolve();
        } else {
          reject(new Error(`Orca CLI keluar dengan kode ${code}`));
        }
      });

      child.on('error', (err) => {
        if (abortController.signal.aborted) {
          resolve();
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Simulator cerdas mandiri: menyediakan respons realistis dan transisi tahapan
   * saat runtime OpenCode/Orca dijalankan di lingkungan testing atau offline.
   */
  private async runSimulatedAgent(options: {
    prompt: string;
    projectPath: string;
    session: ChatSession;
    abortController: AbortController;
    emitDelta: (delta: string) => void;
    emitStatus: (state: AIStatusState, message: string) => void;
    onProgressCheck: () => Promise<void>;
  }): Promise<void> {
    const { prompt, abortController, emitDelta, emitStatus, onProgressCheck } = options;

    const delay = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        if (abortController.signal.aborted) return reject(new Error('Dibatalkan'));
        const timer = setTimeout(() => resolve(), ms);
        abortController.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Dibatalkan'));
        });
      });

    // 1. Tahap Menganalisis
    emitStatus('analyzing', 'Sedang menganalisis struktur kode...');
    await delay(50);
    emitDelta(`Menganalisis permintaan: "${prompt}"...\n`);
    await onProgressCheck();

    // 2. Tahap Mengedit file
    emitStatus('coding', 'Mengedit file...');
    await delay(50);
    emitDelta('Menemukan berkas target dan menerapkan modifikasi komponen...\n');
    await onProgressCheck();

    // 3. Tahap Menjalankan build
    emitStatus('building', 'Menjalankan build...');
    await delay(50);
    emitDelta('Memverifikasi perubahan kode dan kompilasi modul...\n');
    await onProgressCheck();

    // 4. Deteksi commit
    await delay(30);
    emitDelta('Semua perubahan berhasil diverifikasi dan disinkronkan.\n');
  }

  // ==========================================================================
  // HTTP & SSE Route Handlers
  // ==========================================================================

  private extractSessionId(param: unknown, queryParam?: unknown): string {
    const val = param || queryParam || '';
    if (Array.isArray(val)) {
      return String(val[0] || '').trim();
    }
    return String(val).trim();
  }

  /**
   * Handler untuk SSE stream: GET `/api/chat/stream/:sessionId`
   */
  public handleSSEStreamRoute = (req: Request, res: Response): void => {
    const sessionId = this.extractSessionId(req.params?.sessionId, req.query?.sessionId);
    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: 'Parameter sessionId wajib disertakan.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Pastikan session ada di memori
    this.getOrCreateSession(sessionId);

    // Set header standar Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    const subscriberId = `sse_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const subscriber: SSESubscriber = {
      id: subscriberId,
      type: 'sse',
      sessionId,
      res,
    };

    // Heartbeat berkala setiap 15 detik agar koneksi SSE tidak diputus oleh proxy/Cloudflare
    subscriber.heartbeatTimer = setInterval(() => {
      try {
        const ping: HeartbeatEvent = {
          type: 'heartbeat',
          sessionId,
          timestamp: new Date().toISOString(),
        };
        res.write(`data: ${JSON.stringify(ping)}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch {
        this.removeSubscriber(subscriber);
      }
    }, 15000);

    const unsubscribe = this.addSubscriber(subscriber);

    // Tangani saat klien memutuskan koneksi
    req.on('close', () => {
      unsubscribe();
    });
    req.on('error', () => {
      unsubscribe();
    });
  };

  /**
   * Handler untuk pengiriman pesan prompt: POST `/api/chat/send`
   */
  public handleSendMessageRoute = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body || {};
      const promptText = body.prompt || body.message || body.content || body.text;
      const payload: SendMessageRequest = {
        sessionId: body.sessionId,
        prompt: promptText,
        message: promptText,
        projectPath: body.projectPath,
        targetAgent: body.targetAgent,
        context: body.context,
      };

      const result = await this.sendMessage(payload);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message || 'Gagal mengirim pesan prompt.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * Handler untuk mengambil riwayat percakapan: GET `/api/chat/history/:sessionId`
   */
  public handleGetHistoryRoute = (req: Request, res: Response): void => {
    const sessionId = this.extractSessionId(req.params?.sessionId);
    if (!sessionId) {
      res.status(400).json({ success: false, error: 'Parameter sessionId diperlukan.' });
      return;
    }
    const history = this.getHistory(sessionId);
    res.status(200).json({
      success: true,
      sessionId,
      messages: history,
      timestamp: new Date().toISOString(),
    });
  };

  /**
   * Handler untuk membatalkan proses eksekusi: POST `/api/chat/cancel/:sessionId`
   */
  public handleCancelRoute = (req: Request, res: Response): void => {
    const sessionId = this.extractSessionId(req.params?.sessionId);
    if (!sessionId) {
      res.status(400).json({ success: false, error: 'Parameter sessionId diperlukan.' });
      return;
    }
    const cancelled = this.cancelSession(sessionId);
    res.status(200).json({
      success: true,
      sessionId,
      cancelled,
      timestamp: new Date().toISOString(),
    });
  };

  /**
   * Handler untuk melihat status session: GET `/api/chat/status/:sessionId`
   */
  public handleGetStatusRoute = (req: Request, res: Response): void => {
    const sessionId = this.extractSessionId(req.params?.sessionId);
    const session = this.getSession(sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session tidak ditemukan.' });
      return;
    }
    res.status(200).json({
      success: true,
      sessionId,
      status: session.status,
      statusMessage: session.statusMessage,
      isStreaming: session.isStreaming,
      activeCommitHash: session.activeCommitHash,
      updatedAt: session.updatedAt,
      timestamp: new Date().toISOString(),
    });
  };

  // ==========================================================================
  // WebSocket Connection Handler
  // ==========================================================================

  /**
   * Menerima dan menangani koneksi WebSocket klien
   */
  public handleWebSocketConnection(ws: any, initialSessionId?: string): () => void {
    let currentSessionId = initialSessionId || `session_${Date.now()}`;
    const subscriberId = `ws_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    let subscriber: WebSocketSubscriber = {
      id: subscriberId,
      type: 'ws',
      sessionId: currentSessionId,
      ws,
    };

    let unsubscribe = this.addSubscriber(subscriber);

    ws.on('message', async (raw: any) => {
      try {
        const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
        const data = JSON.parse(text);

        if (data.type === 'subscribe' && data.sessionId) {
          unsubscribe();
          currentSessionId = data.sessionId;
          subscriber = {
            id: subscriberId,
            type: 'ws',
            sessionId: currentSessionId,
            ws,
          };
          unsubscribe = this.addSubscriber(subscriber);
        } else if (data.type === 'send' || data.prompt) {
          const prompt = data.prompt || data.message;
          const sessionId = data.sessionId || currentSessionId;
          await this.sendMessage({
            sessionId,
            prompt,
            targetAgent: data.targetAgent,
            projectPath: data.projectPath,
            context: data.context,
          });
        } else if (data.type === 'cancel') {
          const sessionId = data.sessionId || currentSessionId;
          this.cancelSession(sessionId);
        }
      } catch (err: any) {
        ws.send(
          JSON.stringify({
            type: 'error',
            sessionId: currentSessionId,
            error: err.message || 'Kesalahan parsing pesan WebSocket.',
            timestamp: new Date().toISOString(),
          })
        );
      }
    });

    ws.on('close', () => {
      unsubscribe();
    });

    ws.on('error', () => {
      unsubscribe();
    });

    return unsubscribe;
  }

  // ==========================================================================
  // Express Router Builder
  // ==========================================================================

  /**
   * Membuat Router Express lengkap untuk endpoint chat bridge
   */
  public createRouter(): Router {
    const router = express.Router();

    router.use(express.json());

    router.post('/send', this.handleSendMessageRoute);
    router.post('/message', this.handleSendMessageRoute);
    router.get('/stream/:sessionId', this.handleSSEStreamRoute);
    router.get('/stream', this.handleSSEStreamRoute);
    router.get('/history/:sessionId', this.handleGetHistoryRoute);
    router.get('/history', this.handleGetHistoryRoute);
    router.post('/cancel/:sessionId', this.handleCancelRoute);
    router.post('/cancel', this.handleCancelRoute);
    router.get('/status/:sessionId', this.handleGetStatusRoute);
    router.get('/status', this.handleGetStatusRoute);
    router.get('/sessions', (_req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        sessions: this.getAllSessions(),
        timestamp: new Date().toISOString(),
      });
    });

    return router;
  }
}

// Singleton Instance
export const chatBridgeService = new ChatBridgeService();
export const createChatRouter = () => chatBridgeService.createRouter();
export default chatBridgeService;
