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

interface TerminalInstance {
  term: Terminal;
  fitAddon: FitAddon;
  element: HTMLDivElement;
}

export const UniversalAgentTerminal: React.FC<UniversalAgentTerminalProps> = ({
  projectPath,
  projectName,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Active Role Tab: 'thinker' (Pemikir) | 'worker_1' | 'worker_2' ...
  const [activeRoleId, setActiveRoleId] = useState<string>('thinker');
  // List of spawned worker IDs
  const [workers, setWorkers] = useState<number[]>([1]);

  // Map of client-side terminal instances per session: sessionId -> { term, fitAddon, element }
  const terminalInstances = useRef<Map<string, TerminalInstance>>(new Map());

  // Max workers limit from settings (1 - 32, default 5)
  const maxWorkers = (() => {
    try {
      const stored = localStorage.getItem('artastudio_max_workers');
      return stored ? Math.min(Math.max(parseInt(stored, 10), 1), 32) : 5;
    } catch {
      return 5;
    }
  })();

  // Current session ID based on active project & role
  const projectKey = (projectPath || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const currentSessionId = `${projectKey}__${activeRoleId}`;
  const currentSessionIdRef = useRef<string>(currentSessionId);
  currentSessionIdRef.current = currentSessionId;

  // Setup WebSocket connection (Persisten tunggal untuk terminal)
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.hostname}:4000`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      // Inisialisasi seluruh sesi yang sudah ada di frontend ke backend secara paralel
      terminalInstances.current.forEach((inst, sId) => {
        initSessionOnServer(sId);
      });
      // Pastikan sesi aktif saat ini diinisialisasi
      initSessionOnServer(currentSessionIdRef.current);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.channel === 'terminal') {
          const targetSessId = payload.sessionId || currentSessionIdRef.current;
          const inst = terminalInstances.current.get(targetSessId);

          if (payload.event === 'output' && payload.data) {
            if (inst) {
              inst.term.write(payload.data);
            }
            // Tanggapi CPR query jika terminal client membutuhkannya
            if (payload.data.includes('\x1b[6n') && socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  channel: 'terminal',
                  action: 'input',
                  sessionId: targetSessId,
                  data: '\x1b[1;1R',
                })
              );
            }
          } else if (payload.event === 'exit') {
            if (inst) {
              inst.term.write(`\r\n\x1b[90m[Proses shell keluar dengan kode: ${payload.code}]\x1b[0m\r\n`);
            }
          }
        }
      } catch {
        // Fallback write to active term
        const activeInst = terminalInstances.current.get(currentSessionIdRef.current);
        if (activeInst) {
          activeInst.term.write(event.data);
        }
      }
    };

    // Listener custom event untuk menerima prompt dari modal (Perbaiki Otomatis / Fix Semua)
    const handleCustomTerminalInput = (e: Event) => {
      const customEvent = e as CustomEvent<{ text: string }>;
      if (customEvent.detail && customEvent.detail.text) {
        const textToSend = customEvent.detail.text;
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              channel: 'terminal',
              action: 'input',
              sessionId: currentSessionIdRef.current,
              data: `${textToSend}\r`,
            })
          );
          const activeInst = terminalInstances.current.get(currentSessionIdRef.current);
          activeInst?.term.focus();
        }
      }
    };

    window.addEventListener('artastudio:terminal:input', handleCustomTerminalInput);

    return () => {
      window.removeEventListener('artastudio:terminal:input', handleCustomTerminalInput);
      socket.close();
    };
  }, []);

  // Helper untuk membuat atau mengambil instance xterm terisolasi per sesi
  const getOrCreateTerminal = (sessId: string, pPath: string): TerminalInstance => {
    const existing = terminalInstances.current.get(sessId);
    if (existing) return existing;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    const termDiv = document.createElement('div');
    termDiv.className = 'w-full h-full flex flex-col flex-1 min-w-0 min-h-0';
    termDiv.style.display = 'none'; // Sembunyikan jika tidak aktif
    containerRef.current?.appendChild(termDiv);

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: isMobile ? 10 : 12,
      lineHeight: 1.15,
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
    term.open(termDiv);

    // Keyboard Input dari Browser ➔ Kirim ke PTY Backend
    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            channel: 'terminal',
            action: 'input',
            sessionId: sessId,
            data,
          })
        );
      }
    });

    // Dukungan scroll sentuh untuk HP Android / Touch Screen
    let touchStartY = 0;
    termDiv.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          touchStartY = e.touches[0].clientY;
        }
      },
      { passive: true }
    );

    termDiv.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 1) {
          const touchY = e.touches[0].clientY;
          const diff = touchStartY - touchY;

          // Jika TUI sedang aktif dan menggunakan mouse tracking, biarkan atau kirim scroll
          if (Math.abs(diff) > 16) {
            const lines = Math.round(diff / 16);
            if (term.modes.mouseTrackingMode !== 'none') {
              // Di TUI (seperti opencode/agy/less): Kirim panah ke PTY untuk navigasi list
              const key = lines > 0 ? '\x1b[B' : '\x1b[A';
              const count = Math.min(Math.abs(lines), 3);
              for (let i = 0; i < count; i++) {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(
                    JSON.stringify({
                      channel: 'terminal',
                      action: 'input',
                      sessionId: sessId,
                      data: key,
                    })
                  );
                }
              }
            } else {
              // Di buffer terminal biasa: Gulir halaman ke atas/bawah
              term.scrollLines(lines);
            }
            touchStartY = touchY;
          }
        }
      },
      { passive: true }
    );

    const instance: TerminalInstance = { term, fitAddon, element: termDiv };
    terminalInstances.current.set(sessId, instance);

    initSessionOnServer(sessId, pPath);

    return instance;
  };

  // Helper untuk melakukan auto-fit responsif dan sync resize ke backend
  const triggerFit = (inst: TerminalInstance, sId: string) => {
    try {
      if (!inst.element || inst.element.style.display === 'none') return;
      inst.fitAddon.fit();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && inst.term.cols && inst.term.rows) {
        wsRef.current.send(
          JSON.stringify({
            channel: 'terminal',
            action: 'resize',
            sessionId: sId,
            cols: inst.term.cols,
            rows: inst.term.rows,
          })
        );
      }
    } catch {}
  };

  // Helper untuk mengirim inisialisasi sesi ke backend
  const initSessionOnServer = (sessId: string, pPath?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const inst = terminalInstances.current.get(sessId);
    if (inst) triggerFit(inst, sessId);
    // Kirim init untuk seluruh sesi yang terdaftar di frontend
    terminalInstances.current.forEach((inst, sId) => {
      wsRef.current?.send(
        JSON.stringify({
          channel: 'terminal',
          action: 'init',
          sessionId: sId,
          projectPath: pPath || projectPath,
          cols: inst?.term.cols || 100,
          rows: inst?.term.rows || 30,
        })
      );
    });
  };

  // Efek ketika berganti Tab Role atau berganti Proyek
  useEffect(() => {
    if (!containerRef.current) return;

    // Pastikan instance untuk sesi ini sudah ada
    const currentInst = getOrCreateTerminal(currentSessionId, projectPath);

    // Tampilkan elemen terminal aktif, dan sembunyikan semua terminal sesi lain
    terminalInstances.current.forEach((inst, sId) => {
      if (sId === currentSessionId) {
        inst.element.style.display = 'flex';
        // Jalankan fit beruntun (immediate, frame ke-1, dan 120ms) agar transisi flexbox CSS selesai merender ukuran nyata
        triggerFit(inst, sId);
        requestAnimationFrame(() => {
          triggerFit(inst, sId);
          inst.term.focus();
        });
        setTimeout(() => {
          triggerFit(inst, sId);
          inst.term.focus();
        }, 120);
      } else {
        inst.element.style.display = 'none';
      }
    });
  }, [currentSessionId, projectPath]);

  // Pasang ResizeObserver pada container agar begitu ukuran berubah langsung fit presisi & auto-stretch
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      const activeInst = terminalInstances.current.get(currentSessionIdRef.current);
      if (activeInst && activeInst.element.style.display !== 'none') {
        triggerFit(activeInst, currentSessionIdRef.current);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Handler: Tambah Worker Baru
  const handleAddWorker = () => {
    if (workers.length >= maxWorkers) return;
    const nextWorkerId = workers.length > 0 ? Math.max(...workers) + 1 : 1;
    setWorkers((prev) => [...prev, nextWorkerId]);
    setActiveRoleId(`worker_${nextWorkerId}`);
  };

  // Handler: Tutup Worker
  const handleCloseWorker = (wId: number) => {
    if (workers.length <= 1) return;
    const targetSession = `${projectKey}__worker_${wId}`;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          channel: 'terminal',
          action: 'kill',
          sessionId: targetSession,
        })
      );
    }

    const inst = terminalInstances.current.get(targetSession);
    if (inst) {
      inst.term.dispose();
      inst.element.remove();
      terminalInstances.current.delete(targetSession);
    }

    setWorkers((prev) => prev.filter((id) => id !== wId));
    if (activeRoleId === `worker_${wId}`) {
      setActiveRoleId('thinker');
    }
  };

  // Fungsi reload/recreate canvas terminal untuk tab aktif secara instan tanpa perlu reload seluruh halaman web
  const reloadActiveTerminal = () => {
    const sId = currentSessionIdRef.current;
    const oldInst = terminalInstances.current.get(sId);
    if (oldInst) {
      try {
        oldInst.term.dispose();
        oldInst.element.remove();
      } catch {}
      terminalInstances.current.delete(sId);
    }
    const newInst = getOrCreateTerminal(sId, projectPath);
    newInst.element.style.display = 'flex';
    requestAnimationFrame(() => {
      triggerFit(newInst, sId);
      newInst.term.focus();
    });
  };

  // Helper untuk mengirim perintah langsung dari shortcut dengan auto-reload guard
  const sendCommand = (cmd: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    // Kirim command ke shell
    wsRef.current.send(
      JSON.stringify({
        channel: 'terminal',
        action: 'input',
        sessionId: currentSessionId,
        data: `\x03\r\n${cmd}\r\n`,
      })
    );

    // Kirim sinyal Redraw Ctrl+L setelah jeda singkat agar TUI langsung muncul tanpa layar hitam
    setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            channel: 'terminal',
            action: 'input',
            sessionId: currentSessionId,
            data: '\x0c',
          })
        );
      }
      terminalInstances.current.get(currentSessionId)?.term.focus();
    }, 400);
  };

  // Helper keyboard touch mobile
  const sendKey = (keyData: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        channel: 'terminal',
        action: 'input',
        sessionId: currentSessionId,
        data: keyData,
      })
    );
    terminalInstances.current.get(currentSessionId)?.term.focus();
  };

  // State untuk input teks mobile langsung
  const [mobileInputText, setMobileInputText] = useState('');

  const handleMobileSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!mobileInputText) {
      sendKey('\r');
      return;
    }
    sendKey(mobileInputText + '\r');
    setMobileInputText('');
  };

  return (
    <div
      onClick={() => {
        const inst = terminalInstances.current.get(currentSessionId);
        if (inst) {
          inst.term.focus();
          const hiddenTextarea = inst.element.querySelector('textarea');
          if (hiddenTextarea) hiddenTextarea.focus();
        }
      }}
      className="flex-1 flex flex-col bg-[#0a0f19] h-full overflow-hidden select-text cursor-text"
    >
      {/* Orca Dual-Role Tab Header: [✓ Pemikir] & [• Worker 1..32] */}
      <div className="h-9 border-b border-slate-800/80 bg-[#090d16] px-2 flex items-center justify-between text-xs shrink-0 select-none overflow-x-auto no-scrollbar">
        {/* Left: Role Tabs */}
        <div className="flex items-center gap-1">
          {/* Tab Pemikir (The Thinker / Planner) */}
          <button
            type="button"
            onClick={() => setActiveRoleId('thinker')}
            className={`px-3 py-1.5 text-xs rounded-t-md flex items-center gap-1.5 transition-all cursor-pointer ${
              activeRoleId === 'thinker'
                ? 'bg-[#0a0f19] text-emerald-300 font-bold border-t-2 border-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
            title="Terminal Pemikir (Chat & Perencana Tugas AI)"
          >
            <span className="text-emerald-400 font-black text-sm">✓</span>
            <span>Pemikir</span>
          </button>

          {/* Tabs Worker Pool (The Executors) */}
          {workers.map((wId) => {
            const isSelected = activeRoleId === `worker_${wId}`;
            return (
              <div
                key={wId}
                onClick={() => setActiveRoleId(`worker_${wId}`)}
                className={`group/w px-2.5 py-1.5 text-xs rounded-t-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#0a0f19] text-amber-300 font-bold border-t-2 border-amber-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
                title={`Terminal Worker ${wId} (Eksekutor Kode Bebas)`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isSelected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                <span>Worker {wId}</span>
                {workers.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseWorker(wId);
                    }}
                    className="ml-1 opacity-0 group-hover/w:opacity-100 hover:text-red-400 text-slate-500 p-0.5 rounded text-[10px] transition-opacity"
                    title={`Hentikan Worker ${wId}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}

          {/* Button Add Worker (+) up to max limit */}
          {workers.length < maxWorkers && (
            <button
              type="button"
              onClick={handleAddWorker}
              className="px-2 py-1 text-[11px] rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-400 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer flex items-center gap-1"
              title={`Tambah Worker Eksekutor (Maksimal ${maxWorkers})`}
            >
              <span>+ Worker</span>
            </button>
          )}
        </div>

        {/* Right: Quick CLI launchers & Clear */}
        <div className="flex items-center gap-1.5">
          {activeRoleId.startsWith('worker') && (
            <div className="hidden sm:flex items-center gap-1 mr-1 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => sendCommand('agy')}
                className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 hover:bg-emerald-900 border border-emerald-800/50"
                title="Jalankan agy di worker ini"
              >
                agy
              </button>
              <button
                type="button"
                onClick={() => sendCommand('opencode')}
                className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 hover:bg-amber-900 border border-amber-800/50"
                title="Jalankan opencode di worker ini"
              >
                opencode
              </button>
              <button
                type="button"
                onClick={() => sendCommand('commandcode')}
                className="px-1.5 py-0.5 rounded bg-indigo-950/60 text-indigo-400 hover:bg-indigo-900 border border-indigo-800/50"
                title="Jalankan commandcode di worker ini"
              >
                commandcode
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              reloadActiveTerminal();
            }}
            className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono transition-colors flex items-center gap-1 cursor-pointer"
            title="Muat Ulang / Segarkan Tampilan Terminal Ini"
          >
            <span>↻</span>
            <span>Reload</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              sendCommand('clear');
            }}
            className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors"
            title="Bersihkan Layar Terminal (Ctrl+L)"
          >
            Clear
          </button>
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>TTY</span>
          </div>
        </div>
      </div>

      {/* Terminal Viewport Multi-Container (Setiap tab punya instance DOM sendiri yang di-show/hide) */}
      <div
        className="flex-1 w-full h-full p-1 sm:p-2 bg-[#0a0f19] overflow-hidden outline-none cursor-text relative flex flex-col"
        ref={containerRef}
        tabIndex={0}
        onClick={() => terminalInstances.current.get(currentSessionId)?.term.focus()}
        style={{ minHeight: '200px' }}
      />

      {/* Mobile & Android Virtual Keyboard Quick Bar & Direct Input Box */}
      <div className="border-t border-slate-800/80 bg-slate-900/95 flex flex-col shrink-0 select-none">
        {/* Input Text Form khusus Mobile Touch (Memastikan keyboard HP 100% muncul & bisa ngetik) */}
        <form onSubmit={handleMobileSubmit} className="p-1.5 flex items-center gap-1.5 border-b border-slate-800/60">
          <input
            type="text"
            value={mobileInputText}
            onChange={(e) => setMobileInputText(e.target.value)}
            placeholder="Ketik perintah / pesan disini..."
            className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500 shadow-inner"
          />
          <button
            type="submit"
            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow active:scale-95 flex items-center gap-1 shrink-0"
          >
            <span>Kirim</span>
            <span>↵</span>
          </button>
        </form>

        {/* Quick Functional Keys */}
        <div className="h-7 px-2 flex items-center gap-1.5 overflow-x-auto text-[10px] font-mono">
          <button
            type="button"
            onClick={() => {
              const inst = terminalInstances.current.get(currentSessionId);
              if (inst) {
                inst.term.focus();
                const ta = inst.element.querySelector('textarea');
                if (ta) ta.focus();
              }
            }}
            className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 active:scale-95 shrink-0 font-sans font-bold"
          >
            ⌨️ Keyboard Layar
          </button>
          <div className="w-px h-3.5 bg-slate-700 mx-0.5 shrink-0" />
          <button
            type="button"
            onClick={() => sendKey('\x1b')}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 shrink-0"
          >
            Esc
          </button>
          <button
            type="button"
            onClick={() => sendKey('\t')}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 shrink-0"
          >
            Tab
          </button>
          <button
            type="button"
            onClick={() => sendKey('\x03')}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold active:scale-95 shrink-0"
          >
            Ctrl+C
          </button>
          <button
            type="button"
            onClick={() => sendKey('\x1b[A')}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 shrink-0"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => sendKey('\x1b[B')}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 shrink-0"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => {
              const inst = terminalInstances.current.get(currentSessionId);
              if (inst) {
                if (inst.term.modes.mouseTrackingMode !== 'none') {
                  sendKey('\x1b[5~'); // Page Up untuk TUI
                } else {
                  inst.term.scrollLines(-15);
                }
              }
            }}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 shrink-0"
            title="Gulir ke Atas (Page Up)"
          >
            PgUp ⇞
          </button>
          <button
            type="button"
            onClick={() => {
              const inst = terminalInstances.current.get(currentSessionId);
              if (inst) {
                if (inst.term.modes.mouseTrackingMode !== 'none') {
                  sendKey('\x1b[6~'); // Page Down untuk TUI
                } else {
                  inst.term.scrollLines(15);
                }
              }
            }}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 shrink-0"
            title="Gulir ke Bawah (Page Down)"
          >
            PgDn ⇟
          </button>
        </div>
      </div>
    </div>
  );
};
