import { Router } from 'express';
import { processManager } from '../services/processManager';

export const processRouter = Router();

processRouter.post('/start', async (req, res) => {
  const { projectPath, port } = req.body;
  if (!projectPath) {
    return res.status(400).json({ error: 'projectPath wajib diisi' });
  }
  const instance = await processManager.startDevServer(projectPath, port);
  const cleanInstance = { ...instance, process: undefined };
  res.json({ success: true, instance: cleanInstance });
});

processRouter.post('/stop', async (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath) {
    return res.status(400).json({ error: 'projectPath wajib diisi' });
  }
  const success = await processManager.stopDevServer(projectPath);
  res.json({ success });
});

processRouter.get('/status', (req, res) => {
  const projectPath = req.query.projectPath as string;
  if (!projectPath) {
    return res.json({ instances: processManager.getAllInstances() });
  }
  const status = processManager.getDevServerStatus(projectPath);
  res.json({ status: status || { status: 'stopped' } });
});

processRouter.get('/logs', (req, res) => {
  const projectPath = req.query.projectPath as string;
  const lines = parseInt(req.query.lines as string || '50', 10);
  if (!projectPath) {
    return res.status(400).json({ error: 'projectPath wajib diisi' });
  }
  const logs = processManager.getRecentLogs(projectPath, lines);
  res.json({ logs });
});
