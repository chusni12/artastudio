import * as nodePty from 'node-pty';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const ptyModule: typeof nodePty = (nodePty as any).default || nodePty;

export interface TerminalSession {
  id: string;
  projectPath: string;
  ptyProcess: nodePty.IPty;
  ws?: WebSocket;
  bufferHistory: string[];
  lastActive: number;
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();

  public createSession(
    id: string,
    projectPath: string,
    ws: WebSocket,
    cols: number = 80,
    rows: number = 24,
    initialCmd?: string
  ): TerminalSession {
    // 1. Jika sesi sudah ada sebelumnya, lakukan RE-ATTACH tanpa mematikan proses PTY!
    const existing = this.sessions.get(id);
    if (existing) {
      existing.ws = ws;
      existing.lastActive = Date.now();
      if (cols > 0 && rows > 0) {
        try {
          existing.ptyProcess.resize(Math.max(cols, 80), Math.max(rows, 24));
        } catch {}
      }

      // Replay output buffer terakhir agar tampilan di browser langsung pulih utuh
      if (existing.bufferHistory.length > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            channel: 'terminal',
            event: 'output',
            data: existing.bufferHistory.join(''),
          })
        );
      }
      return existing;
    }

    const isWindows = process.platform === 'win32';
    const shell = isWindows ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || '/bin/bash');
    const cwd = projectPath || process.cwd();

    // Pastikan PATH mencakup folder CLI opencode, agy, commandcode, nvm, cargo, local bin
    const homeDir = os.homedir();
    const additionalPaths = [
      path.join(homeDir, '.opencode/bin'),
      path.join(homeDir, '.local/bin'),
      path.join(homeDir, '.config/orca/linux-orca-cli-shim'),
      path.join(homeDir, '.cargo/bin'),
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/local/sbin',
      '/usr/sbin',
      '/sbin',
    ];

    // Temukan node/nvm bin saat ini jika ada
    const currentExecPath = path.dirname(process.execPath);
    if (!additionalPaths.includes(currentExecPath)) {
      additionalPaths.unshift(currentExecPath);
    }

    const currentPath = process.env.PATH || '';
    const mergedPath = Array.from(new Set([...additionalPaths, ...currentPath.split(path.delimiter)])).join(path.delimiter);

    // Spawn TRUE PTY BASH/CMD INTERAKTIF
    const ptyProcess = ptyModule.spawn(shell, isWindows ? [] : ['-l'], {
      name: 'xterm-256color',
      cols: Math.max(cols || 80, 80),
      rows: Math.max(rows || 30, 24),
      cwd,
      env: {
        ...process.env,
        PATH: mergedPath,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '1',
        LANG: process.env.LANG || 'en_US.UTF-8',
      },
    });

    const session: TerminalSession = {
      id,
      projectPath: cwd,
      ptyProcess,
      ws,
      bufferHistory: [],
      lastActive: Date.now(),
    };

    this.sessions.set(id, session);

    // Kirim data langsung dari PTY ke WebSocket browser & simpan riwayat buffer
    ptyProcess.onData((data: string) => {
      // Auto-reply DSR (Device Status Report / Cursor Position Query) jika diminta oleh TUI seperti opencode
      if (data.includes('\x1b[6n')) {
        try {
          ptyProcess.write('\x1b[1;1R');
        } catch {}
      }

      // Simpan ke ring buffer history (maks 300 chunk ~ 150KB)
      session.bufferHistory.push(data);
      if (session.bufferHistory.length > 300) {
        session.bufferHistory.shift();
      }
      session.lastActive = Date.now();

      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({ channel: 'terminal', event: 'output', data }));
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({ channel: 'terminal', event: 'exit', code: exitCode }));
      }
      this.sessions.delete(id);
    });

    // Jika user memilih agent (opencode / agy / claude), jalankan dengan enter nyata!
    if (initialCmd && initialCmd !== 'bash') {
      setTimeout(() => {
        try {
          ptyProcess.write(`${initialCmd}\r\n`);
        } catch {}
      }, 600);
    }

    return session;
  }

  public write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session) {
      try {
        session.lastActive = Date.now();
        session.ptyProcess.write(data);
      } catch (err) {
        console.warn('[TerminalManager] Write error:', err);
      }
    }
  }

  public resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (session && cols > 0 && rows > 0) {
      try {
        session.ptyProcess.resize(Math.max(cols, 80), Math.max(rows, 24));
      } catch {}
    }
  }

  public detachWs(ws: WebSocket): void {
    for (const session of this.sessions.values()) {
      if (session.ws === ws) {
        session.ws = undefined;
      }
    }
  }

  public killSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      try {
        session.ptyProcess.kill();
      } catch {}
      this.sessions.delete(id);
    }
  }

  public getSessionCount(): number {
    return this.sessions.size;
  }
}

export const terminalManager = new TerminalManager();
