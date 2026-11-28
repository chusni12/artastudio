import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  clampWorkerId,
  dispatchToWorker,
  getProjectWorkerStatuses,
  reportToThinker,
} from '../services/orchestratorService';

const router = Router();

function resolveValidatedProjectPath(rawPath: unknown): { projectPath: string; error?: string } {
  const input = typeof rawPath === 'string' && rawPath.trim() ? rawPath.trim() : process.cwd();
  const resolved = path.resolve(input);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { projectPath: resolved, error: `Direktori proyek tidak ditemukan: ${resolved}` };
  }
  return { projectPath: resolved };
}

router.post('/dispatch', (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, workerId, task, agent, autoLaunchAgent } = req.body || {};
    if (typeof task !== 'string' || !task.trim()) {
      return res.status(400).json({ success: false, error: 'Field "task" wajib diisi.' });
    }

    const { projectPath, error } = resolveValidatedProjectPath(rawPath);
    if (error) {
      return res.status(400).json({ success: false, error });
    }

    const parsedWorker = typeof workerId === 'number' ? workerId : parseInt(String(workerId || '1'), 10);
    const result = dispatchToWorker({
      projectPath,
      workerId: clampWorkerId(parsedWorker),
      task: task.trim(),
      agent: typeof agent === 'string' ? agent : undefined,
      autoLaunchAgent: typeof autoLaunchAgent === 'boolean' ? autoLaunchAgent : undefined,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Gagal melakukan dispatch ke worker.' });
  }
});

router.post('/report', (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, workerId, status, summary, filesChanged, rawReport } = req.body || {};
    const { projectPath, error } = resolveValidatedProjectPath(rawPath);
    if (error) {
      return res.status(400).json({ success: false, error });
    }

    const parsedWorker = typeof workerId === 'number' ? workerId : parseInt(String(workerId || '1'), 10);
    const result = reportToThinker({
      projectPath,
      workerId: clampWorkerId(parsedWorker),
      status: typeof status === 'string' && status.trim() ? status.trim().toUpperCase() : 'DONE',
      summary: typeof summary === 'string' ? summary.trim() : '',
      filesChanged: Array.isArray(filesChanged) ? filesChanged.map(String) : undefined,
      rawReport: typeof rawReport === 'string' ? rawReport : undefined,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Gagal mengirim laporan ke pemikir.' });
  }
});

router.get('/status', (req: Request, res: Response) => {
  try {
    const { projectPath, error } = resolveValidatedProjectPath(req.query.projectPath);
    if (error) {
      return res.status(400).json({ success: false, error });
    }
    const workers = getProjectWorkerStatuses(projectPath);
    return res.json({ success: true, projectPath, workers });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Gagal mengambil status worker.' });
  }
});

export default router;
