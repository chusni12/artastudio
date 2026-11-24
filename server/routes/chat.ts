import { Router, Request, Response } from 'express';
import type { ChatMessage, ChatSession } from '../../shared/types';
import { broadcastWebSocketEvent } from '../ws';
import { realAiService } from '../services/realAiService';

const router = Router();
const activeSessions = new Map<string, ChatSession>();
const sseClients = new Map<string, Set<Response>>();

function getOrCreateSession(sessionId: string, projectPath: string = process.cwd()): ChatSession {
  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, {
      id: sessionId,
      projectPath,
      messages: [
        {
          id: 'welcome',
          sender: 'assistant',
          text: 'Halo! Saya AI Assistant ArtaStudio. Ada yang bisa saya bantu untuk pengembangan web hari ini?',
          timestamp: new Date().toISOString(),
          status: 'done',
        },
      ],
      createdAt: new Date().toISOString(),
    });
  }
  return activeSessions.get(sessionId)!;
}

function broadcastSSE(sessionId: string, data: any): void {
  const clients = sseClients.get(sessionId);
  if (!clients || clients.size === 0) return;

  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
      if (typeof (client as any).flush === 'function') {
        (client as any).flush();
      }
    } catch {
      clients.delete(client);
    }
  }
}

/**
 * Endpoint pengiriman pesan & instruksi AI: POST /api/chat/message
 */
const handleSendMessage = (req: Request, res: Response) => {
  const { sessionId = 'default', text, prompt, message, projectPath = process.cwd(), engineMode = 'opencode' } = req.body || {};
  const promptText = (text || prompt || message || '').trim();

  if (!promptText) {
    return res.status(400).json({ success: false, error: 'Pesan text / prompt wajib disertakan.' });
  }

  const session = getOrCreateSession(sessionId, projectPath);

  // 1. Simpan dan broadcast pesan pengguna
  const userMsg: ChatMessage = {
    id: `msg_${Date.now()}_u`,
    sender: 'user',
    text: promptText,
    timestamp: new Date().toISOString(),
  };

  session.messages.push(userMsg);
  broadcastWebSocketEvent('chat', 'message:new', userMsg);
  broadcastSSE(sessionId, { type: 'message:new', message: userMsg });

  // 2. Siapkan wadah respons AI Assistant nyata
  const assistantMsgId = `msg_${Date.now()}_a`;
  const assistantMsg: ChatMessage = {
    id: assistantMsgId,
    sender: 'assistant',
    text: '',
    timestamp: new Date().toISOString(),
    status: 'analyzing',
    statusMessage: 'Menghubungkan ke OpenCode AI Engine...',
    actionLogs: [],
  };

  session.messages.push(assistantMsg);
  broadcastWebSocketEvent('chat', 'message:new', assistantMsg);
  broadcastSSE(sessionId, { type: 'message:new', message: assistantMsg });

  // Respon HTTP awal dikirimkan seketika agar client tidak timeout
  res.json({
    success: true,
    userMessage: userMsg,
    assistantMessage: assistantMsg,
  });

  // 3. Jalankan Real AI Chat Engine (OpenCode CLI runner / LLM Streaming Bridge)
  realAiService
    .executePrompt({
      prompt: promptText,
      projectPath: session.projectPath || projectPath,
      sessionId,
      engineMode,
      onActionLog: (log) => {
        if (!assistantMsg.actionLogs) {
          assistantMsg.actionLogs = [];
        }
        const existingIdx = assistantMsg.actionLogs.findIndex((l) => l.id === log.id);
        if (existingIdx >= 0) {
          assistantMsg.actionLogs[existingIdx] = log;
        } else {
          assistantMsg.actionLogs.push(log);
        }

        broadcastWebSocketEvent('chat', 'message:action_log', {
          id: assistantMsg.id,
          messageId: assistantMsg.id,
          actionLog: log,
          actionLogs: assistantMsg.actionLogs,
          message: assistantMsg,
        });

        broadcastSSE(sessionId, {
          type: 'action_log',
          messageId: assistantMsg.id,
          actionLog: log,
          actionLogs: assistantMsg.actionLogs,
          message: assistantMsg,
        });
      },
      onChunk: (delta, accumulated) => {
        assistantMsg.text = accumulated;
        broadcastWebSocketEvent('chat', 'message:new', assistantMsg);
        broadcastWebSocketEvent('chat', 'message:chunk', {
          id: assistantMsg.id,
          delta,
          accumulated,
          text: accumulated,
          status: assistantMsg.status,
          message: assistantMsg,
        });
        broadcastSSE(sessionId, {
          type: 'text_delta',
          delta,
          accumulated,
          message: assistantMsg,
        });
      },
      onStatus: (status, statusMessage) => {
        assistantMsg.status = status;
        assistantMsg.statusMessage = statusMessage;
        broadcastWebSocketEvent('chat', 'message:new', assistantMsg);
        broadcastWebSocketEvent('chat', 'message:status', {
          id: assistantMsg.id,
          status,
          statusMessage,
          message: assistantMsg,
        });
        broadcastSSE(sessionId, {
          type: 'status',
          status,
          message: statusMessage,
          assistantMsg,
        });
      },
    })
    .then((finalText) => {
      if (assistantMsg.actionLogs) {
        assistantMsg.actionLogs = assistantMsg.actionLogs.map((l) =>
          l.status === 'running' ? { ...l, status: 'success' } : l
        );
      }
      assistantMsg.status = 'done';
      assistantMsg.statusMessage = undefined;
      assistantMsg.text = finalText;
      broadcastWebSocketEvent('chat', 'message:new', assistantMsg);
      broadcastWebSocketEvent('chat', 'message:status', {
        id: assistantMsg.id,
        status: 'done',
        message: assistantMsg,
        actionLogs: assistantMsg.actionLogs,
      });
      broadcastSSE(sessionId, {
        type: 'done',
        message: assistantMsg,
      });
    })
    .catch((err) => {
      if (assistantMsg.actionLogs) {
        assistantMsg.actionLogs = assistantMsg.actionLogs.map((l) =>
          l.status === 'running' ? { ...l, status: 'failed' } : l
        );
      }
      assistantMsg.status = 'error';
      assistantMsg.statusMessage = 'Gagal memproses instruksi';
      assistantMsg.text = `Gagal memproses instruksi: ${err instanceof Error ? err.message : String(err)}`;
      broadcastWebSocketEvent('chat', 'message:new', assistantMsg);
      broadcastWebSocketEvent('chat', 'message:status', {
        id: assistantMsg.id,
        status: 'error',
        message: assistantMsg,
        actionLogs: assistantMsg.actionLogs,
      });
      broadcastSSE(sessionId, {
        type: 'error',
        error: assistantMsg.text,
        message: assistantMsg,
      });
    });
};

router.post('/message', handleSendMessage);
router.post('/send', handleSendMessage);

/**
 * Sinkronisasi pesan dari IndexedDB / client ke backend in-memory session
 */
router.post('/sync', (req: Request, res: Response) => {
  const { sessionId = 'default', messages = [], projectPath = process.cwd() } = req.body || {};
  const session = getOrCreateSession(sessionId, projectPath);
  if (Array.isArray(messages) && messages.length > 0) {
    session.messages = messages;
  }
  res.json({ success: true, count: session.messages.length });
});

/**
 * Mengambil riwayat percakapan: GET /api/chat/history
 */
router.get('/history', (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId as string) || 'default';
  const session = getOrCreateSession(sessionId);
  res.json({ success: true, messages: session.messages });
});

router.get('/history/:sessionId', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId || 'default';
  const session = getOrCreateSession(sessionId);
  res.json({ success: true, messages: session.messages });
});

/**
 * Server-Sent Events stream: GET /api/chat/stream/:sessionId
 */
router.get('/stream/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let clients = sseClients.get(sessionId);
  if (!clients) {
    clients = new Set();
    sseClients.set(sessionId, clients);
  }
  clients.add(res);

  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId, timestamp: new Date().toISOString() })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(`: keep-alive\n\n`);
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    const set = sseClients.get(sessionId);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        sseClients.delete(sessionId);
      }
    }
  });
});

/**
 * Membatalkan proses yang sedang berjalan: POST /api/chat/cancel/:sessionId
 */
const handleCancel = (req: Request, res: Response) => {
  const sessionId = req.params.sessionId || req.body?.sessionId || 'default';
  const cancelled = realAiService.cancel(sessionId);
  res.json({ success: true, sessionId, cancelled });
};

router.post('/cancel/:sessionId', handleCancel);
router.post('/cancel', handleCancel);

/**
 * Status sesi AI: GET /api/chat/status/:sessionId
 */
router.get('/status/:sessionId', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId || 'default';
  const isBusy = realAiService.isBusy(sessionId);
  const session = activeSessions.get(sessionId);
  res.json({
    success: true,
    sessionId,
    isBusy,
    messageCount: session ? session.messages.length : 0,
  });
});

export default router;
