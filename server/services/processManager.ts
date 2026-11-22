import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';

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

class ProcessManager extends EventEmitter {
  private instances: Map<string, DevServerInstance> = new Map();
  private maxLogsPerInstance = 300;

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
      const fs = require('fs');
      let devCmd = 'npm run dev';
      const pkgPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.scripts && !pkg.scripts.dev && pkg.scripts.start) {
            devCmd = 'npm start';
          }
        } catch(e) {}
      }

      this.addLog(projectPath, 'system', `Menjalankan: ${devCmd} di ${projectPath}`);

      const child = spawn(devCmd, {
        cwd: projectPath,
        shell: true,
        env: {
          ...process.env,
          PORT: preferredPort ? String(preferredPort) : undefined,
          FORCE_COLOR: '1'
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
      });

      child.on('close', (code) => {
        instance.status = 'stopped';
        this.addLog(projectPath, 'system', `Dev server berhenti dengan kode keluar ${code}`);
        this.emit('status_change', instance);
      });

      child.on('error', (err) => {
        instance.status = 'crashed';
        this.addLog(projectPath, 'system', `Gagal menjalankan dev server: ${err.message}`);
        this.emit('status_change', instance);
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
      instance.process.kill('SIGTERM');
      instance.status = 'stopped';
      this.addLog(projectPath, 'system', 'Dev server dihentikan oleh user.');
      this.emit('status_change', instance);
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

    const splitLines = rawText.split('\n').filter(l => l.trim().length > 0);
    const now = new Date().toISOString();

    for (const line of splitLines) {
      instance.logs.push({
        timestamp: now,
        type,
        message: line
      });
    }

    if (instance.logs.length > this.maxLogsPerInstance) {
      instance.logs = instance.logs.slice(-this.maxLogsPerInstance);
    }

    this.emit('log', { projectPath, lines: splitLines });
  }

  private detectServerUrl(instance: DevServerInstance, text: string) {
    // Regex deteksi URL Vite / Next: http://localhost:5199 atau http://127.0.0.1:5173
    const urlMatch = text.match(/https?:\/\/(localhost|127\.0\.0\.1):(\d+)/i);
    if (urlMatch) {
      instance.url = urlMatch[0];
      instance.port = parseInt(urlMatch[2], 10);
      instance.status = 'running';
      this.emit('status_change', instance);
    }
  }
}

export const processManager = new ProcessManager();
