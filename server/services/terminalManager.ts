import * as nodePty from 'node-pty';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { syncProjectSkript } from './skriptService';

const ptyModule: typeof nodePty = (nodePty as any).default || nodePty;

export interface TerminalRoleMeta {
  role?: 'thinker' | 'worker';
  workerId?: number;
}

export interface TerminalSession {
  id: string;
  projectPath: string;
  ptyProcess: nodePty.IPty;
  ws?: WebSocket;
  bufferHistory: string[];
  lastActive: number;
  role?: 'thinker' | 'worker';
  workerId?: number;
  activeAgentCmd?: string;
  commandBuffer?: string;
}

export type TerminalOutputWatcher = (sessionId: string, projectPath: string, data: string) => void;

export function toProjectKey(projectPath: string): string {
  return (projectPath || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function extractAgentName(cmd?: string): string | undefined {
  if (!cmd) return undefined;
  const trimmed = cmd.trim();
  const match = trimmed.match(/^(agy|opencode|commandcode|claude)(?:\s|$)/i);
  return match ? match[1].toLowerCase() : undefined;
}

function inferRoleMeta(id: string, roleMeta?: TerminalRoleMeta): { role: 'thinker' | 'worker'; workerId?: number } {
  if (roleMeta?.role === 'worker' || roleMeta?.workerId !== undefined) {
    return { role: 'worker', workerId: roleMeta.workerId };
  }
  if (roleMeta?.role === 'thinker') {
    return { role: 'thinker' };
  }
  const workerMatch = id.match(/__worker_(\d+)$/);
  if (workerMatch) {
    return { role: 'worker', workerId: parseInt(workerMatch[1], 10) };
  }
  return { role: 'thinker' };
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private outputWatchers = new Set<TerminalOutputWatcher>();

  public registerOutputWatcher(watcher: TerminalOutputWatcher): () => void {
    this.outputWatchers.add(watcher);
    return () => {
      this.outputWatchers.delete(watcher);
    };
  }

  public createSession(
    id: string,
    projectPath: string,
    ws?: WebSocket,
    cols: number = 100,
    rows: number = 30,
    initialCmd?: string,
    roleMeta?: TerminalRoleMeta
  ): TerminalSession {
    // 1. Jika sesi sudah ada sebelumnya, lakukan RE-ATTACH tanpa mematikan proses PTY!
    const existing = this.sessions.get(id);
    if (existing) {
      if (ws) {
        existing.ws = ws;
      }
      existing.lastActive = Date.now();

      // Selalu kirim seluruh buffer snapshot terakhir ke WebSocket client baru agar layar tidak pernah blank hitam!
      if (ws && existing.bufferHistory.length > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            channel: 'terminal',
            event: 'output',
            sessionId: id,
            data: existing.bufferHistory.join(''),
          })
        );
      }

      // Kirim trigger window resize / SIGWINCH agar proses TUI menyesuaikan ukuran viewport
      if (cols > 0 && rows > 0) {
        try {
          existing.ptyProcess.resize(cols, rows);
        } catch {}
      }
      return existing;
    }

    const isWindows = process.platform === 'win32';
    // Di CachyOS / Arch Linux, default shell user biasanya zsh atau fish. Jika fish, fallback ke bash/zsh agar kompatibel dengan POSIX PTY xterm
    let shell = isWindows ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || '/bin/bash');
    if (!isWindows && shell.endsWith('/fish')) {
      if (fs.existsSync('/bin/bash')) shell = '/bin/bash';
      else if (fs.existsSync('/usr/bin/bash')) shell = '/usr/bin/bash';
      else if (fs.existsSync('/bin/zsh')) shell = '/bin/zsh';
    }
    const cwd = projectPath || process.cwd();

    // Sinkronkan skript.md proyek sesuai protokol default/custom ArtaStudio
    try {
      syncProjectSkript(cwd);
    } catch {}

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

    // Pastikan file AGENTS.md ada di folder proyek agar AI otomatis membaca konteks ArtaStudio
    try {
      const agentsMdPath = path.join(cwd, 'AGENTS.md');
      if (!fs.existsSync(agentsMdPath)) {
        const projectName = path.basename(cwd);
        const autoAgentsMd = `# Panduan Lingkungan ArtaStudio (Untuk AI Agent)

Anda adalah AI Developer Agent yang bekerja di dalam ekosistem **ArtaStudio Suite**.
- **Proyek Saat Ini:** ${projectName}
- **Direktori Kerja Utama:** ${cwd}
- **Live Preview Viewport:** Terletak di panel sebelah kanan browser user.

## Peran & Tanggung Jawab:
1. **Fokus Kode Proyek:** Semua perubahan kode, debugging, dan pembuatan fitur dilakukan langsung di dalam direktori proyek ini (${cwd}).
2. **Kontrol Live Preview & Status Proyek:**
   - Gunakan CLI bawaan untuk memeriksa status atau menyalakan dev server:
     \`\`\`bash
     artastudio preview status   # Periksa apakah Live Preview sedang aktif
     artastudio preview start    # Menyalakan dev server Live Preview jika belum menyala
     artastudio info             # Lihat informasi detail proyek, port, dan framework
     \`\`\`
3. **Protokol Orkestrasi Pemikir & 32 Worker (\`skript.md\`):**
   - Patuhi pedoman pembagian peran di \`skript.md\`: Pemikir merancang & memverifikasi DoD secara read-only, sedangkan Worker \`1..32\` mengeksekusi kode sesuai \`SCOPE_FILES\`.
   - Pemikir dapat mendelegasikan tugas melalui blok \`[DISPATCH TO WORKER]...[/DISPATCH TO WORKER]\` atau CLI \`artastudio dispatch --worker <1..32> --task "..."\`.
   - Worker wajib melapor otomatis via blok \`[WORKER REPORT]...[/WORKER REPORT]\` atau CLI \`artastudio report --worker <1..32> --status DONE --summary "..."\`.
4. **Pemeriksaan & Perbaikan Keamanan:**
   - Jika menerima tugas perbaikan temuan keamanan (Database RLS, dependensi CVE, secrets exposure), lakukan perbaikan langsung pada berkas terkait secara terisolasi tanpa merusak arsitektur lain.
5. **Validasi Kualitas Kode:**
   - Selalu jalankan uji build lokal (\`npm run build\` atau \`npm test\`) sebelum menyelesaikan tugas.
`;
        fs.writeFileSync(agentsMdPath, autoAgentsMd, 'utf8');
      }
    } catch {}

    const projectName = path.basename(cwd);
    let previewPort = '5173';
    if (projectName.toLowerCase().includes('artaloka') || cwd.includes('bowhead')) {
      previewPort = '5199';
    } else if (projectName.toLowerCase().includes('tahqiq')) {
      previewPort = '3000';
    }

    const resolvedRole = inferRoleMeta(id, roleMeta);
    const ptyEnv: Record<string, string | undefined> = {
      ...process.env,
      PATH: mergedPath,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
      LANG: process.env.LANG || 'en_US.UTF-8',
      ARTASTUDIO: 'true',
      ARTASTUDIO_PROJECT_NAME: projectName,
      ARTASTUDIO_PROJECT_PATH: cwd,
      ARTASTUDIO_PREVIEW_URL: `http://localhost:${previewPort}`,
      ARTASTUDIO_SESSION_ID: id,
      ARTASTUDIO_ROLE: resolvedRole.role,
      ARTASTUDIO_PORT: process.env.PORT || '4000',
    };
    if (resolvedRole.role === 'worker' && resolvedRole.workerId !== undefined) {
      ptyEnv.ARTASTUDIO_WORKER_ID = String(resolvedRole.workerId);
    }

    // Spawn TRUE PTY BASH/CMD INTERAKTIF
    const ptyProcess = ptyModule.spawn(shell, isWindows ? [] : ['-l'], {
      name: 'xterm-256color',
      cols: Math.max(cols || 100, 80),
      rows: Math.max(rows || 30, 24),
      cwd,
      env: ptyEnv,
    });

    const initialAgent = extractAgentName(initialCmd);
    const session: TerminalSession = {
      id,
      projectPath: cwd,
      ptyProcess,
      ws,
      bufferHistory: [],
      lastActive: Date.now(),
      role: resolvedRole.role,
      workerId: resolvedRole.workerId,
      activeAgentCmd: initialAgent,
      commandBuffer: '',
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
        session.ws.send(JSON.stringify({ channel: 'terminal', event: 'output', sessionId: id, data }));
      }

      for (const watcher of this.outputWatchers) {
        try {
          watcher(id, cwd, data);
        } catch {}
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({ channel: 'terminal', event: 'exit', sessionId: id, code: exitCode }));
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

  private trackInputAgentState(session: TerminalSession, data: string): void {
    let buf = session.commandBuffer || '';
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (ch === '\r' || ch === '\n') {
        const line = buf.trim();
        buf = '';
        if (line) {
          const agent = extractAgentName(line);
          if (agent) {
            session.activeAgentCmd = agent;
          } else if (/^(?:\/exit|\/quit|exit|quit)$/i.test(line)) {
            session.activeAgentCmd = undefined;
          }
        }
      } else if (ch === '\x03') {
        buf = '';
      } else if (ch === '\x7f' || ch === '\b') {
        buf = buf.slice(0, -1);
      } else if (ch >= ' ') {
        buf += ch;
      }
    }
    session.commandBuffer = buf.slice(-512);
  }

  public markAgentActive(id: string, agentCmd?: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.activeAgentCmd = agentCmd ? extractAgentName(agentCmd) || agentCmd.trim().toLowerCase() : undefined;
  }

  public getSession(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  public hasSession(id: string): boolean {
    return this.sessions.has(id);
  }

  public writeIfActive(id: string, data: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    try {
      session.lastActive = Date.now();
      this.trackInputAgentState(session, data);
      session.ptyProcess.write(data);
      return true;
    } catch (err) {
      console.warn('[TerminalManager] Write error:', err);
      return false;
    }
  }

  public listProjectSessions(projectPath: string): TerminalSession[] {
    const resolved = path.resolve(projectPath || process.cwd());
    const keyPrefix = `${toProjectKey(projectPath)}__`;
    const result: TerminalSession[] = [];
    for (const session of this.sessions.values()) {
      if (path.resolve(session.projectPath) === resolved || session.id.startsWith(keyPrefix)) {
        result.push(session);
      }
    }
    return result;
  }

  public write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session) {
      try {
        session.lastActive = Date.now();
        this.trackInputAgentState(session, data);
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
