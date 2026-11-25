import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import '@xterm/xterm/css/xterm.css?inline';

interface UniversalAgentTerminalProps {
  projectPath: string;
  projectName: string;
  wsConnected: boolean;
}

export const UniversalAgentTerminal: React.FC<UniversalAgentTerminalProps> = ({
  projectPath,
  projectName,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionId = useRef<string>(`term_${Date.now()}`);

  const [activeTab, setActiveTab] = useState<'opencode' | 'agy' | 'claude' | 'bash'>('opencode');

  // Inisialisasi xterm & PTY WebSocket Connection
  useEffect(() => {
    if (!terminalRef.current) return;

    // Bersihkan terminal DOM lama jika ada
    terminalRef.current.innerHTML = '';

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 12,
      lineHeight: 1.2,
      fontFamily: '"JetBrains Mono", Menlo, Monaco, Consolas, monospace',
      allowProposedApi: true,
      convertEol: true,
      scrollback: 5000,
      theme: {
        background: '#0a0f19',
        foreground: '#f1f5f9',
        cursor: '#f59e0b',
        cursorAccent: '#0a0f19',
        selectionBackground: 'rgba(245, 158, 11, 0.3)',
        black: '#0a0f19',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    term.focus();

    try {
      fitAddon.fit();
    } catch {}

    xtermInstance.current = term;
    fitAddonInstance.current = fitAddon;

    // Connect Real PTY WebSocket
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.hostname}:4000`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      // Inisialisasi PTY Session di Backend
      socket.send(
        JSON.stringify({
          channel: 'terminal',
          action: 'init',
          sessionId: sessionId.current,
          projectPath,
          cols: term.cols,
          rows: term.rows,
          // Start pure interactive shell
          command: undefined,
        })
      );
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.channel === 'terminal') {
          if (payload.event === 'output' && payload.data) {
            term.write(payload.data);
          } else if (payload.event === 'exit') {
            term.write(`\r\n\x1b[90m[Proses shell keluar dengan kode: ${payload.code}]\x1b[0m\r\n`);
          }
        }
      } catch {
        term.write(event.data);
      }
    };

    // Keyboard Input dari Browser ➔ Kirim ke PTY Backend
    const onDataDisposable = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            channel: 'terminal',
            action: 'input',
            sessionId: sessionId.current,
            data,
          })
        );
      }
    });

    const handleResize = () => {
      try {
        fitAddon.fit();
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              channel: 'terminal',
              action: 'resize',
              sessionId: sessionId.current,
              cols: term.cols,
              rows: term.rows,
            })
          );
        }
      } catch {}
    };

    window.addEventListener('resize', handleResize);

    return () => {
      onDataDisposable.dispose();
      window.removeEventListener('resize', handleResize);
      socket.close();
      term.dispose();
    };
  }, [projectPath]);

  // Handle Switch Agent Tab (Quick Launch)
  const handleSwitchAgent = (agent: 'opencode' | 'agy' | 'claude' | 'bash') => {
    setActiveTab(agent);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    let launchCmd = '';
    if (agent === 'opencode') launchCmd = 'opencode';
    else if (agent === 'agy') launchCmd = 'agy';
    else if (agent === 'claude') launchCmd = 'claude';
    else if (agent === 'bash') launchCmd = 'clear';

    // Kirim Ctrl+C (\x03) lalu jalankan perintah baru
    wsRef.current.send(
      JSON.stringify({
        channel: 'terminal',
        action: 'input',
        sessionId: sessionId.current,
        data: `\x03\r${launchCmd}\r`,
      })
    );
    xtermInstance.current?.focus();
  };

  return (
    <div
      onClick={() => xtermInstance.current?.focus()}
      className="flex-1 flex flex-col bg-[#0a0f19] h-full overflow-hidden select-text cursor-text"
    >
      {/* Terminal Top Agent Selector Toolbar */}
      <div className="h-9 border-b border-slate-800/80 bg-slate-900/90 px-3 flex items-center justify-between text-xs shrink-0 select-none">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSwitchAgent('opencode');
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'opencode'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span>⚡ OpenCode</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSwitchAgent('agy');
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'agy'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span>🚀 Agy CLI</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSwitchAgent('claude');
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'claude'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span>✨ Claude / Custom</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSwitchAgent('bash');
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'bash'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span>💻 Terminal Bash/CMD</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="hidden sm:inline">{projectName}</span>
        </div>
      </div>

      {/* Terminal Viewport Container (Fixed Full Dimensions for TUI Alt-Screen Buffer) */}
      <div
        className="flex-1 w-full h-full p-2 bg-[#0a0f19] overflow-hidden outline-none cursor-text relative flex flex-col"
        ref={terminalRef}
        tabIndex={0}
        onClick={() => xtermInstance.current?.focus()}
        style={{ minHeight: '400px' }}
      />
    </div>
  );
};
