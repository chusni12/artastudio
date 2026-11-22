import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import net from 'node:net';
import express from 'express';
import type { Server } from 'node:http';
import {
  scanWorkspaces,
  findProjectDetail,
  getProjects,
  getProjectDetail,
  detectFramework,
  detectDevPort,
  isPortActive,
  workspaceRouter,
} from './workspaceService.js';
import type { ApiResponse, ProjectInfo, ProjectDetail } from '../../shared/types.js';

describe('ArtaStudio Workspace Discovery Service', () => {
  describe('Framework Detection', () => {
    it('detects React dependency', () => {
      const framework = detectFramework({ react: '^19.0.0', 'react-dom': '^19.0.0' });
      expect(framework).toBe('React');
    });

    it('detects Vite dependency', () => {
      const framework = detectFramework({}, { vite: '^5.4.0' });
      expect(framework).toBe('Vite');
    });

    it('detects Next.js dependency', () => {
      const framework = detectFramework({ next: '^14.2.0' });
      expect(framework).toBe('Next');
    });

    it('detects TanStack Start dependency', () => {
      const framework = detectFramework({ '@tanstack/react-start': '^1.168.0' });
      expect(framework).toBe('TanStack Start');
    });

    it('detects Svelte dependency', () => {
      const framework = detectFramework({ svelte: '^4.2.0' });
      expect(framework).toBe('Svelte');
    });

    it('detects Vue dependency', () => {
      const framework = detectFramework({ vue: '^3.4.0' });
      expect(framework).toBe('Vue');
    });

    it('falls back to Node.js when no UI framework is present', () => {
      const framework = detectFramework({ chalk: '^5.0.0' });
      expect(framework).toBe('Node.js');
    });
  });

  describe('Dev Port Detection', () => {
    it('detects 5173 from script', async () => {
      const pkg = { scripts: { dev: 'vite --port 5173' } };
      const { devPort } = await detectDevPort('/tmp', pkg, 'Vite');
      expect(devPort).toBe(5173);
    });

    it('detects 5199 from script', async () => {
      const pkg = { scripts: { dev: 'tsx watch server/index.ts --port 5199' } };
      const { devPort } = await detectDevPort('/tmp', pkg, 'Node.js');
      expect(devPort).toBe(5199);
    });

    it('detects 3000 from script', async () => {
      const pkg = { scripts: { dev: 'next dev -p 3000' } };
      const { devPort } = await detectDevPort('/tmp', pkg, 'Next');
      expect(devPort).toBe(3000);
    });

    it('detects 8080 from script environment prefix', async () => {
      const pkg = { scripts: { start: 'PORT=8080 node server.js' } };
      const { devPort } = await detectDevPort('/tmp', pkg, 'Express');
      expect(devPort).toBe(8080);
    });

    it('falls back to default framework port', async () => {
      const pkg = { scripts: { dev: 'vite' } };
      const { devPort } = await detectDevPort('/tmp', pkg, 'Vite');
      expect(devPort).toBe(5173);
    });
  });

  describe('Port Active Check', () => {
    let testServer: net.Server;
    const testPort = 59871;

    beforeAll(async () => {
      await new Promise<void>((resolve) => {
        testServer = net.createServer();
        testServer.listen(testPort, '127.0.0.1', () => resolve());
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        testServer.close(() => resolve());
      });
    });

    it('reports true when a port is actively listening', async () => {
      const active = await isPortActive(testPort);
      expect(active).toBe(true);
    });

    it('reports false when a port is not listening', async () => {
      const active = await isPortActive(59872);
      expect(active).toBe(false);
    });
  });

  describe('scanWorkspaces()', () => {
    it('scans workspaces and returns valid ProjectInfo objects', async () => {
      const projects = await scanWorkspaces('/home/chusni/orca/workspaces');
      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBeGreaterThan(0);

      const first = projects[0];
      expect(first).toHaveProperty('id');
      expect(typeof first.id).toBe('string');
      expect(first).toHaveProperty('name');
      expect(typeof first.name).toBe('string');
      expect(first).toHaveProperty('path');
      expect(typeof first.path).toBe('string');
      expect(first).toHaveProperty('framework');
      expect(typeof first.framework).toBe('string');
      expect(first).toHaveProperty('hasGit');
      expect(typeof first.hasGit).toBe('boolean');
      expect(first).toHaveProperty('status');
      expect(['idle', 'running']).toContain(first.status);
      expect(first).toHaveProperty('lastModified');
      expect(new Date(first.lastModified).getTime()).not.toBeNaN();
    });

    it('discovers git branch when git repository exists', async () => {
      const projects = await scanWorkspaces('/home/chusni/orca/workspaces');
      const gitProjects = projects.filter((p) => p.hasGit);
      expect(gitProjects.length).toBeGreaterThan(0);

      const withBranch = gitProjects.find((p) => Boolean(p.currentBranch));
      expect(withBranch).toBeDefined();
      expect(typeof withBranch?.currentBranch).toBe('string');
    });

    it('gracefully handles non-existent paths', async () => {
      const result = await scanWorkspaces('/path/to/non/existent/workspaces/xyz');
      expect(result).toEqual([]);
    });
  });

  describe('findProjectDetail() and getProjectDetail()', () => {
    it('retrieves detailed project info for an existing project', async () => {
      const projects = await scanWorkspaces('/home/chusni/orca/workspaces');
      const target = projects[0];

      const detail = await findProjectDetail(target.id, '/home/chusni/orca/workspaces');
      expect(detail).toBeDefined();
      expect(detail?.id).toBe(target.id);
      expect(detail?.path).toBe(target.path);
      expect(detail).toHaveProperty('packageJson');
      expect(detail).toHaveProperty('detectedConfigs');
    });

    it('returns null for unknown project id', async () => {
      const detail = await findProjectDetail('non-existent-workspace-random-987');
      expect(detail).toBeNull();
    });
  });

  describe('Express Router and API Handlers', () => {
    let app: express.Express;
    let server: Server;
    const testPort = 59873;

    beforeAll(async () => {
      await new Promise<void>((resolve) => {
        app = express();
        app.use(express.json());
        app.use('/api/projects', workspaceRouter);
        server = app.listen(testPort, '127.0.0.1', () => resolve());
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it('GET /api/projects returns 200 and project list', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/api/projects`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as ApiResponse<ProjectInfo[]>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data?.length).toBeGreaterThan(0);
    });

    it('GET /api/projects/:id returns 200 and project detail', async () => {
      const listRes = await fetch(`http://127.0.0.1:${testPort}/api/projects`);
      const listBody = (await listRes.json()) as ApiResponse<ProjectInfo[]>;
      const firstId = listBody.data![0].id;

      const res = await fetch(`http://127.0.0.1:${testPort}/api/projects/${firstId}`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as ApiResponse<ProjectDetail>;
      expect(body.success).toBe(true);
      expect(body.data?.id).toBe(firstId);
    });

    it('GET /api/projects/:id returns 404 for non-existent project', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/api/projects/unknown-404-id`);
      expect(res.status).toBe(404);

      const body = (await res.json()) as ApiResponse<never>;
      expect(body.success).toBe(false);
      expect(body.error).toContain('Project not found');
    });
  });
});
