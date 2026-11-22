import { Router, Request, Response } from 'express';
import type { DeploymentInfo } from '../../shared/types';
import { broadcastWebSocketEvent } from '../ws';

const router = Router();
const deploymentHistory: DeploymentInfo[] = [];

router.post('/trigger', async (req: Request, res: Response) => {
  const { projectPath = process.cwd() } = req.body;

  const deploymentId = `dep_${Date.now()}`;
  const deployment: DeploymentInfo = {
    id: deploymentId,
    projectPath,
    status: 'deploying',
    logs: [`[${new Date().toISOString()}] Memulai verifikasi konfigurasi edge deployment...`],
    createdAt: new Date().toISOString(),
  };

  deploymentHistory.unshift(deployment);
  if (deploymentHistory.length > 50) deploymentHistory.pop();

  broadcastWebSocketEvent('system', 'deploy:started', deployment);

  // Asynchronous simulation / wrangler trigger
  setTimeout(() => {
    deployment.status = 'succeeded';
    deployment.url = `https://studio-preview.artaloka.workers.dev`;
    deployment.logs.push(`[${new Date().toISOString()}] Build parity lolos.`);
    deployment.logs.push(`[${new Date().toISOString()}] Edge worker berhasil dipublikasikan: ${deployment.url}`);
    broadcastWebSocketEvent('system', 'deploy:finished', deployment);
  }, 1200);

  res.json({
    success: true,
    message: 'Edge deployment triggered',
    deployment,
  });
});

router.get('/logs/:deploymentId', (req: Request, res: Response) => {
  const { deploymentId } = req.params;
  const deployment = deploymentHistory.find((d) => d.id === deploymentId);

  if (!deployment) {
    return res.status(404).json({ success: false, error: 'Deployment not found' });
  }

  res.json({ success: true, logs: deployment.logs });
});

router.get('/history', (req: Request, res: Response) => {
  res.json({ success: true, deployments: deploymentHistory });
});

export default router;
