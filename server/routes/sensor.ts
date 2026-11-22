import { Router, Request, Response } from 'express';
import type { DetectedError } from '../../shared/types';
import { broadcastWebSocketEvent } from '../ws';

const router = Router();
const errorLog: DetectedError[] = [];

router.post('/runtime-error', (req: Request, res: Response) => {
  const { title, message, file, line, column, stack, type = 'runtime' } = req.body;

  const detected: DetectedError = {
    id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    title: title || 'Browser Runtime Error',
    message: message || 'An unhandled exception occurred in the preview viewport',
    file,
    line,
    column,
    stack,
    timestamp: new Date().toISOString(),
  };

  errorLog.push(detected);
  if (errorLog.length > 200) errorLog.shift();

  broadcastWebSocketEvent('errors', 'error:detected', detected);

  res.json({ success: true, error: detected });
});

router.get('/errors', (req: Request, res: Response) => {
  res.json({ success: true, errors: errorLog });
});

router.post('/auto-fix', (req: Request, res: Response) => {
  const { errorId } = req.body;
  const targetError = errorLog.find((e) => e.id === errorId) || errorLog[errorLog.length - 1];

  if (!targetError) {
    return res.status(404).json({ success: false, error: 'No error found to auto-fix' });
  }

  const prompt = [
    `Perbaiki error berikut:`,
    `Tipe: ${targetError.type}`,
    `Pesan: ${targetError.message}`,
    targetError.file ? `File: ${targetError.file}:${targetError.line || 1}` : '',
    targetError.stack ? `Stack Trace:\n${targetError.stack}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  broadcastWebSocketEvent('errors', 'error:autofix_requested', {
    errorId: targetError.id,
    prompt,
  });

  res.json({
    success: true,
    message: 'Auto-fix prompt generated and queued',
    prompt,
  });
});

export default router;
