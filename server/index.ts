import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import { setupWebSocket } from './ws';
import workspacesRouter from './routes/workspaces';
import gitRouter from './routes/git';
import { processRouter } from './routes/process';
import sensorRouter from './routes/sensor';
import deployRouter from './routes/deploy';
import chatRouter from './routes/chat';
import securityRouter from './routes/security';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

// Middleware CORS & JSON parser
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP server instance & WebSocket server
const server = http.createServer(app);
const wss = setupWebSocket(server);

// Mounting API routers
app.use('/api/workspaces', workspacesRouter);
app.use('/api/git', gitRouter);
app.use('/api/process', processRouter);
app.use('/api/sensor', sensorRouter);
app.use('/api/deploy', deployRouter);
app.use('/api/chat', chatRouter);
app.use('/api/security', securityRouter);

// Healthcheck endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'ArtaStudio Core Server',
    port: PORT,
    wsConnectedClients: wss.clients.size,
    timestamp: new Date().toISOString(),
  });
});

// Root API overview
// Serve Frontend Client Static Assets
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
  app.use(express.static(clientDistPath, { etag: false, maxAge: 0 }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  app.get('/', (req: Request, res: Response) => {
    res.json({
      name: 'ArtaStudio Server',
      description: 'AI Web Development Suite Core API (Frontend client/dist not built yet)',
      endpoints: ['/api/workspaces', '/api/git', '/api/process', '/api/sensor', '/api/deploy', '/api/chat', '/api/health']
    });
  });
}

// Start listening
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[ArtaStudio] Server listening on http://localhost:${PORT}`);
    console.log(`[ArtaStudio] WebSocket server ready on ws://localhost:${PORT}`);
  });
}

export { app, server, wss };
