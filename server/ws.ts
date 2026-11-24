import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { WebSocketChannel, WebSocketEvent } from '../shared/types';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  subscriptions: Set<string>;
}

let wssInstance: WebSocketServer | null = null;

export function setupWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server });
  wssInstance = wss;

  wss.on('connection', (ws: WebSocket) => {
    const extWs = ws as ExtendedWebSocket;
    extWs.isAlive = true;
    extWs.subscriptions = new Set<string>(['logs', 'errors', 'chat', 'system', 'workspaces', 'process', 'git']);

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
      extWs.subscriptions.clear();
    });
  });

  // Keep-alive heartbeat interval (every 30 seconds)
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      const extWs = client as ExtendedWebSocket;
      if (!extWs.isAlive) {
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

export function broadcastWebSocketEvent<T>(channel: WebSocketChannel, event: string, data: T): void {
  if (!wssInstance) return;

  const payload: WebSocketEvent<T> = {
    channel,
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  const message = JSON.stringify(payload);

  wssInstance.clients.forEach((client) => {
    const extWs = client as ExtendedWebSocket;
    if (extWs.readyState === WebSocket.OPEN) {
      if (!extWs.subscriptions || extWs.subscriptions.has(channel)) {
        extWs.send(message);
      }
    }
  });
}

export function getWebSocketServer(): WebSocketServer | null {
  return wssInstance;
}
