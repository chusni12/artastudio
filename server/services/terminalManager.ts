import * as nodePty from 'node-pty';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const ptyModule: typeof nodePty = (nodePty as any).default || nodePty;

export interface TerminalSession {
  id: string;
  projectPath: string;
  ptyProcess: nodePty.IPty;
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
    this.killSession(id);

    const isWindows = process.platform === 'win32';
    const shell = isWindows ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || '/bin/bash');
    const cwd = projectPath || process.cwd();

    // Spawn TRUE PTY TERMINAL (Bukan child_process pipe kaku)
    const ptyProcess = ptyModule.spawn(shell, [], {
      name: 'xterm-256color',
      cols: Math.max(cols || 80, 20),
      rows: Math.max(rows || 24, 10),
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    const session: TerminalSession = {
      id,
      projectPath: cwd,
      ptyProcess,
    };

    this.sessions.set(id, session);

    // Kirim data langsung dari PTY ke WebSocket browser
    ptyProcess.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ channel: 'terminal', event: 'output', data }));
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ channel: 'terminal', event: 'exit', code: exitCode }));
      }
      this.sessions.delete(id);
    });

    // Jalankan perintah awal jika ada (misal: opencode / agy)
    if (initialCmd) {
      setTimeout(() => {
        try {
          ptyProcess.write(`${initialCmd}\r`);
        } catch {}
      }, 500);
    }

    return session;
  }

  public write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session) {
      try {
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
        session.ptyProcess.resize(cols, rows);
      } catch {}
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
}

export const terminalManager = new TerminalManager();
