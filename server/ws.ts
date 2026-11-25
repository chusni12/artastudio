import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { WebSocketChannel, WebSocketEvent } from '../shared/types';
import { terminalManager } from './services/terminalManager';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  subscriptions: Set<string>;
  terminalSessionId?: string;
}

let wssInstance: WebSocketServer | null = null;

export function setupWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server });
  wssInstance = wss;

  wss.on('connection', (ws: WebSocket) => {
    const extWs = ws as ExtendedWebSocket;
    extWs.isAlive = true;
    extWs.subscriptions = new Set<string>(['logs', 'errors', 'chat', 'system', 'workspaces', 'process', 'git', 'terminal']);

    // Send initial connected greeting
    const welcomeMsg: WebSocketEvent<{ status: string; clientCount: number }> = {
      channel: 'system',
      event: 'connected',
      data: {
        status: 'ok',
        clientCount: wss.clients.size,
      },
      timestamp: new Date().toISOString(),
    };
    extWs.send(JSON.stringify(welcomeMsg));

    extWs.on('pong', () => {
      extWs.isAlive = true;
    });

    extWs.on('message', (rawMessage: string | Buffer) => {
      try {
        const payload = JSON.parse(rawMessage.toString());
        
        // 1. True PTY Terminal Channel Messages
        if (payload.channel === 'terminal') {
          if (payload.action === 'init') {
            const sessId = payload.sessionId || `term_${Date.now()}`;
            extWs.terminalSessionId = sessId;
            terminalManager.createSession(
              sessId,
              payload.projectPath,
              extWs,
              payload.cols || 80,
              payload.rows || 24,
              payload.command
            );
          } else if (payload.action === 'input' && payload.data !== undefined) {
            const sessId = extWs.terminalSessionId || payload.sessionId;
            if (sessId) {
              terminalManager.write(sessId, payload.data);
            }
          } else if (payload.action === 'resize' && payload.cols && payload.rows) {
            const sessId = extWs.terminalSessionId || payload.sessionId;
            if (sessId) {
              terminalManager.resize(sessId, payload.cols, payload.rows);
            }
          } else if (payload.action === 'kill') {
            const sessId = extWs.terminalSessionId || payload.sessionId;
            if (sessId) {
              terminalManager.killSession(sessId);
            }
          }
          return;
        }

        // 2. Generic Subscription
        if (payload.action === 'subscribe' && typeof payload.channel === 'string') {
          extWs.subscriptions.add(payload.channel);
        } else if (payload.action === 'unsubscribe' && typeof payload.channel === 'string') {
          extWs.subscriptions.delete(payload.channel);
        } else if (payload.action === 'ping') {
          extWs.send(JSON.stringify({ channel: 'system', event: 'pong', data: null, timestamp: new Date().toISOString() }));
        }
      } catch {
        // Silently ignore non-JSON messages
      }
    });

    extWs.on('close', () => {
      if (extWs.terminalSessionId) {
        terminalManager.killSession(extWs.terminalSessionId);
      }
    });

    extWs.on('error', (err) => {
      console.warn('[WebSocket] Client error:', err.message);
    });
  });

  // Heartbeat interval to clean up dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (!extWs.isAlive) {
        if (extWs.terminalSessionId) {
          terminalManager.killSession(extWs.terminalSessionId);
        }
        return extWs.terminate();
      }
      extWs.isAlive = false;
      extWs.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return wss;
}

export function broadcastWebSocketEvent<T = unknown>(
  channel: WebSocketChannel,
  event: string,
  data: T
): void {
  if (!wssInstance) return;

  const payload: WebSocketEvent<T> = {
    channel,
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  const message = JSON.stringify(payload);

  wssInstance.clients.forEach((client) => {
    const extClient = client as ExtendedWebSocket;
    if (extClient.readyState === WebSocket.OPEN && extClient.subscriptions?.has(channel)) {
      try {
        extClient.send(message);
      } catch (err) {
        console.warn(`[WebSocket] Failed to send message to client on channel ${channel}:`, err);
      }
    }
  });
}
