import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getSkriptState, saveSkript, resetSkript } from '../services/skriptService';

const router = Router();

function resolveValidatedProjectPath(rawPath: unknown): { projectPath: string; error?: string } {
  const input = typeof rawPath === 'string' && rawPath.trim() ? rawPath.trim() : process.cwd();
  const resolved = path.resolve(input);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { projectPath: resolved, error: `Direktori proyek tidak ditemukan: ${resolved}` };
  }
  return { projectPath: resolved };
}

router.get('/', (req: Request, res: Response) => {
  try {
    const { projectPath, error } = resolveValidatedProjectPath(req.query.projectPath);
    if (error) {
      return res.status(400).json({ success: false, error });
    }
    const state = getSkriptState(projectPath);
    return res.json({ success: true, ...state });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Gagal membaca skript.md' });
  }
});

router.put('/', (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, content, scope } = req.body || {};
    const targetScope: 'project' | 'default' = scope === 'default' ? 'default' : 'project';

    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Isi skript.md tidak boleh kosong.' });
    }

    const { projectPath, error } = resolveValidatedProjectPath(rawPath);
    if (error && targetScope === 'project') {
      return res.status(400).json({ success: false, error });
    }

    const state = saveSkript(projectPath, content, targetScope);
    return res.json({ success: true, ...state });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Gagal menyimpan skript.md' });
  }
});

router.post('/reset', (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, scope } = req.body || {};
    const targetScope: 'project' | 'default' = scope === 'default' ? 'default' : 'project';

    const { projectPath, error } = resolveValidatedProjectPath(rawPath);
    if (error && targetScope === 'project') {
      return res.status(400).json({ success: false, error });
    }

    const state = resetSkript(projectPath, targetScope);
    return res.json({ success: true, ...state });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Gagal mereset skript.md' });
  }
});

export default router;
