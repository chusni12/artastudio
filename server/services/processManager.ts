import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { broadcastWebSocketEvent } from '../ws';

export interface ProcessLog {
  timestamp: string;
  type: 'stdout' | 'stderr' | 'system';
  message: string;
}

export interface DevServerInstance {
  projectPath: string;
  projectId: string;
  pid?: number;
  port?: number;
  url?: string;
  status: 'starting' | 'running' | 'stopped' | 'crashed';
  startTime?: string;
  logs: ProcessLog[];
  process?: ChildProcess;
}

function stripAnsi(str: string): string {
  // Menghilangkan kode warna ANSI agar deteksi URL bersih di semua OS
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

class ProcessManager extends EventEmitter {
  private instances: Map<string, DevServerInstance> = new Map();
  private maxLogsPerInstance = 500;

  public async startDevServer(projectPath: string, preferredPort?: number): Promise<DevServerInstance> {
    const existing = this.instances.get(projectPath);
    if (existing && (existing.status === 'running' || existing.status === 'starting')) {
      return existing;
    }

    const projectId = path.basename(projectPath);
    const instance: DevServerInstance = {
      projectPath,
      projectId,
      status: 'starting',
      startTime: new Date().toISOString(),
      logs: []
    };

    this.instances.set(projectPath, instance);
    this.addLog(projectPath, 'system', `Memulai dev server untuk ${projectId}...`);

    try {
      let devCmd = 'npm run dev';
      const pkgPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.scripts && !pkg.scripts.dev && pkg.scripts.start) {
            devCmd = 'npm start';
          }
        } catch (e) {}
      }

      this.addLog(projectPath, 'system', `Menjalankan: ${devCmd} di ${projectPath}`);

      const isWindows = process.platform === 'win32';
      const child = spawn(devCmd, {
        cwd: projectPath,
        shell: true,
        env: {
          ...process.env,
          PORT: preferredPort ? String(preferredPort) : undefined,
          NO_COLOR: '1',
          FORCE_COLOR: '0',
        }
      });

      instance.process = child;
      instance.pid = child.pid;

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        this.addLog(projectPath, 'stdout', text);
        this.detectServerUrl(instance, text);
      });

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        this.addLog(projectPath, 'stderr', text);
        this.detectServerUrl(instance, text);
      });

      child.on('close', (code) => {
        instance.status = 'stopped';
        this.addLog(projectPath, 'system', `Dev server berhenti dengan kode keluar ${code}`);
        this.emit('status_change', instance);
        broadcastWebSocketEvent('process', 'status_change', { ...instance, process: undefined });
      });

      child.on('error', (err) => {
        instance.status = 'crashed';
        this.addLog(projectPath, 'system', `Gagal menjalankan dev server: ${err.message}`);
        this.emit('status_change', instance);
        broadcastWebSocketEvent('process', 'status_change', { ...instance, process: undefined });
      });

      return instance;
    } catch (err: any) {
      instance.status = 'crashed';
      this.addLog(projectPath, 'system', `Exception: ${err.message}`);
      return instance;
    }
  }

  public async stopDevServer(projectPath: string): Promise<boolean> {
    const instance = this.instances.get(projectPath);
    if (!instance || !instance.process) return false;

    try {
      const isWindows = process.platform === 'win32';
      if (isWindows && instance.pid) {
        spawn('taskkill', ['/pid', String(instance.pid), '/T', '/F'], { shell: true });
      } else {
        instance.process.kill('SIGTERM');
      }

      instance.status = 'stopped';
      this.addLog(projectPath, 'system', 'Dev server dihentikan oleh user.');
      this.emit('status_change', instance);
      broadcastWebSocketEvent('process', 'status_change', { ...instance, process: undefined });
      return true;
    } catch (e) {
      return false;
    }
  }

  public getDevServerStatus(projectPath: string): DevServerInstance | undefined {
    return this.instances.get(projectPath);
  }

  public getAllInstances(): DevServerInstance[] {
    return Array.from(this.instances.values());
  }

  public getRecentLogs(projectPath: string, lines: number = 50): ProcessLog[] {
    const instance = this.instances.get(projectPath);
    if (!instance) return [];
    return instance.logs.slice(-lines);
  }

  private addLog(projectPath: string, type: 'stdout' | 'stderr' | 'system', rawText: string) {
    const instance = this.instances.get(projectPath);
    if (!instance) return;

    const clean = stripAnsi(rawText);
    const splitLines = clean.split('\n').filter(l => l.trim().length > 0);
    const now = new Date().toISOString();

    for (const line of splitLines) {
      instance.logs.push({
        timestamp: now,
        type,
        message: line
      });
      // Broadcast langsung ke WebSocket agar panel logs streaming di browser live!
      broadcastWebSocketEvent('logs', 'log:new', {
        projectPath,
        type,
        message: `[${path.basename(projectPath)}] ${line}`
      });
    }

    if (instance.logs.length > this.maxLogsPerInstance) {
      instance.logs = instance.logs.slice(-this.maxLogsPerInstance);
    }

    this.emit('log', { projectPath, lines: splitLines });
  }

  private detectServerUrl(instance: DevServerInstance, text: string) {
    const cleanText = stripAnsi(text);
    // Regex deteksi URL Vite / Next: http://localhost:5199, http://127.0.0.1:5173, http://[::1]:3000
    const urlMatch = cleanText.match(/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d+)/i);
    if (urlMatch) {
      const detectedPort = parseInt(urlMatch[2], 10);
      instance.url = `http://localhost:${detectedPort}`;
      instance.port = detectedPort;
      instance.status = 'running';
      this.emit('status_change', instance);
      broadcastWebSocketEvent('process', 'status_change', { ...instance, process: undefined });
    }
  }
}

export const processManager = new ProcessManager();
