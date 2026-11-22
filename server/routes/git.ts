import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import util from 'util';
import type { CommitInfo, CommitDiff } from '../../shared/types';

const execAsync = util.promisify(exec);
const router = Router();

function parseCommitType(msg: string): CommitInfo['type'] {
  const lower = msg.toLowerCase();
  if (lower.startsWith('feat')) return 'feat';
  if (lower.startsWith('fix')) return 'fix';
  if (lower.startsWith('chore')) return 'chore';
  if (lower.startsWith('docs')) return 'docs';
  if (lower.startsWith('refactor')) return 'refactor';
  return 'other';
}

router.get('/history', async (req: Request, res: Response) => {
  const projectPath = (req.query.path as string) || process.cwd();
  const limit = parseInt((req.query.limit as string) || '20', 10);

  try {
    const { stdout } = await execAsync(
      `git log -n ${limit} --pretty=format:"%H|%h|%an|%ad|%s" --date=iso`,
      { cwd: projectPath }
    );

    const commits: CommitInfo[] = stdout
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [hash, shortHash, author, date, message] = line.split('|');
        return {
          hash,
          shortHash,
          author,
          date,
          message,
          type: parseCommitType(message || ''),
        };
      });

    res.json({ success: true, commits });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, commits: [] });
  }
});

router.get('/diff', async (req: Request, res: Response) => {
  const projectPath = (req.query.path as string) || process.cwd();
  const commitHash = req.query.commit as string;

  if (!commitHash) {
    return res.status(400).json({ success: false, error: 'Commit hash is required' });
  }

  try {
    const { stdout: diffOutput } = await execAsync(`git diff ${commitHash}^!`, {
      cwd: projectPath,
    });
    const { stdout: statOutput } = await execAsync(`git show --stat --oneline ${commitHash}`, {
      cwd: projectPath,
    });

    const diff: CommitDiff = {
      commitHash,
      files: [],
      rawDiff: diffOutput || statOutput,
    };

    res.json({ success: true, diff });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/preview', async (req: Request, res: Response) => {
  const { projectPath = process.cwd(), commitHash } = req.body;
  if (!commitHash) {
    return res.status(400).json({ success: false, error: 'commitHash is required' });
  }

  try {
    await execAsync(`git checkout ${commitHash}`, { cwd: projectPath });
    res.json({ success: true, message: `Switched preview to ${commitHash}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/revert', async (req: Request, res: Response) => {
  const { projectPath = process.cwd(), commitHash } = req.body;
  if (!commitHash) {
    return res.status(400).json({ success: false, error: 'commitHash is required' });
  }

  try {
    await execAsync(`git revert --no-edit ${commitHash}`, { cwd: projectPath });
    res.json({ success: true, message: `Reverted commit ${commitHash}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
