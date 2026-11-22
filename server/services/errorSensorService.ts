/**
 * ArtaStudio - Error Sensor & Auto-Fix Engine Service
 *
 * Modul 3: Sistem deteksi bug dan otomatisasi perbaikan:
 * 1. Menangkap event WebSocket dari Vite dev server (HMR compile error).
 * 2. Endpoint POST /api/sensor/runtime-error untuk menerima laporan error dari runtime browser iframe (window.onerror, unhandled promise).
 * 3. Format standar error: DetectedError.
 * 4. Fungsi generateAutoFixPrompt(error: DetectedError) untuk membuat instruksi AI perbaikan bug otomatis.
 */

import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import express from 'express';
import type { Request, Response, Router } from 'express';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type DetectedErrorType = 'compile' | 'runtime' | 'unhandled_rejection';

export interface DetectedError {
  id: string;
  type: DetectedErrorType;
  title: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: string;
  autoFixPrompt?: string;
  rawPayload?: unknown;
}

export interface ViteWsOptions {
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  maxRetries?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (err: unknown) => void;
  WebSocketClass?: any;
}

export interface RuntimeErrorPayload {
  id?: string;
  type?: DetectedErrorType;
  title?: string;
  message?: string;
  errorMessage?: string;
  file?: string;
  filename?: string;
  source?: string;
  url?: string;
  line?: number;
  lineno?: number;
  lineNumber?: number;
  column?: number;
  colno?: number;
  columnNumber?: number;
  stack?: string;
  error?: { message?: string; stack?: string };
  reason?: unknown;
  timestamp?: string | number;
  [key: string]: unknown;
}

export interface ErrorSensorEventMap {
  error: (error: DetectedError) => void;
  'compile-error': (error: DetectedError) => void;
  'runtime-error': (error: DetectedError) => void;
  'unhandled-rejection': (error: DetectedError) => void;
  cleared: () => void;
}

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Strips ANSI escape codes from Vite compiler and console output strings.
 */
export function stripAnsi(text: string): string {
  if (!text || typeof text !== 'string') return '';
  // Match ANSI escape codes
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g, '');
}

/**
 * Generates a unique, collision-resistant error identifier.
 */
export function generateErrorId(prefix: string = 'err'): string {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${randomPart}`;
}

/**
 * Extracts a readable filename basename from a full file path or URL.
 */
export function getFileBasename(filePath?: string): string {
  if (!filePath) return 'unknown';
  const cleanPath = filePath.split('?')[0].split('#')[0];
  const parts = cleanPath.split(/[/\\]/);
  return parts[parts.length - 1] || 'unknown';
}

/**
 * Parses raw Vite dev server HMR messages into a standardized DetectedError.
 * Handles both compile/transform errors, plugin failures, and syntax issues.
 */
export function parseViteHmrError(raw: unknown): DetectedError | null {
  if (!raw) return null;

  let data: any = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      // Not a JSON message
      return null;
    }
  }

  // Vite HMR error event: { type: 'error', err: { ... } }
  if (data && data.type === 'error' && data.err) {
    const err = data.err;
    const cleanMsg = stripAnsi(err.message || 'Vite HMR Compile Error').trim();
    const file = err.loc?.file || err.id || err.file || undefined;
    const line = err.loc?.line ?? err.line ?? undefined;
    const column = err.loc?.column ?? err.column ?? undefined;

    let stack = '';
    if (err.frame) {
      stack += `Code Frame:\n${stripAnsi(err.frame)}\n\n`;
    }
    if (err.stack) {
      stack += stripAnsi(err.stack);
    }
    stack = stack.trim() || undefined;

    const baseName = getFileBasename(file);
    const title = file
      ? `Kesalahan Kompilasi Vite pada ${baseName}${line ? `:${line}` : ''}`
      : `Kesalahan Kompilasi Vite: ${err.plugin || 'dev server'}`;

    return {
      id: generateErrorId('compile'),
      type: 'compile',
      title,
      message: cleanMsg,
      file,
      line: typeof line === 'number' ? line : undefined,
      column: typeof column === 'number' ? column : undefined,
      stack,
      timestamp: new Date().toISOString(),
      rawPayload: data,
    };
  }

  // Vite custom error event: { type: 'custom', event: 'vite:error', data: { ... } }
  if (data && data.type === 'custom' && data.event === 'vite:error' && data.data) {
    const customData = data.data;
    const cleanMsg = stripAnsi(customData.message || 'Vite Dev Error').trim();
    const file = customData.id || customData.file || undefined;
    const line = customData.line || customData.loc?.line || undefined;
    const column = customData.column || customData.loc?.column || undefined;
    const stack = stripAnsi(customData.frame || customData.stack || '').trim() || undefined;

    return {
      id: generateErrorId('compile'),
      type: 'compile',
      title: `Vite Compile Error: ${getFileBasename(file)}`,
      message: cleanMsg,
      file,
      line: typeof line === 'number' ? line : undefined,
      column: typeof column === 'number' ? column : undefined,
      stack,
      timestamp: new Date().toISOString(),
      rawPayload: data,
    };
  }

  return null;
}

/**
 * Normalizes browser runtime error reports (window.onerror, unhandled rejection)
 * into a standardized DetectedError structure.
 */
export function normalizeRuntimeError(payload: RuntimeErrorPayload): DetectedError {
  let type: DetectedErrorType = 'runtime';
  if (payload.type === 'unhandled_rejection' || payload.reason !== undefined) {
    type = 'unhandled_rejection';
  } else if (payload.type === 'compile') {
    type = 'compile';
  }

  // Extract error message
  let message =
    payload.message ||
    payload.errorMessage ||
    (payload.error && payload.error.message) ||
    '';

  if (!message && payload.reason) {
    if (typeof payload.reason === 'string') {
      message = payload.reason;
    } else if (typeof payload.reason === 'object' && payload.reason !== null) {
      const r = payload.reason as any;
      message = r.message || String(r);
    } else {
      message = String(payload.reason);
    }
  }

  if (!message) {
    message = type === 'unhandled_rejection'
      ? 'Unhandled Promise Rejection terdeteksi pada browser preview'
      : 'Runtime Error tidak terduga pada preview iframe';
  }

  message = stripAnsi(message).trim();

  // Extract file / source
  const rawFile = payload.file || payload.filename || payload.source || payload.url;
  const file = rawFile ? String(rawFile) : undefined;

  // Extract line and column
  const rawLine = payload.line ?? payload.lineno ?? payload.lineNumber;
  const line = typeof rawLine === 'number' && !isNaN(rawLine) ? rawLine : undefined;

  const rawCol = payload.column ?? payload.colno ?? payload.columnNumber;
  const column = typeof rawCol === 'number' && !isNaN(rawCol) ? rawCol : undefined;

  // Extract stack
  let stack = payload.stack || (payload.error && payload.error.stack);
  if (!stack && payload.reason && typeof payload.reason === 'object' && (payload.reason as any).stack) {
    stack = (payload.reason as any).stack;
  }
  if (stack) {
    stack = stripAnsi(String(stack)).trim();
  }

  // Build descriptive title
  let title = payload.title;
  if (!title) {
    const baseName = getFileBasename(file);
    if (type === 'unhandled_rejection') {
      title = file && file !== 'unknown'
        ? `Unhandled Rejection pada ${baseName}${line ? `:${line}` : ''}`
        : `Unhandled Promise Rejection: ${message.slice(0, 50)}`;
    } else {
      title = file && file !== 'unknown'
        ? `Runtime Error pada ${baseName}${line ? `:${line}` : ''}`
        : `Runtime Error: ${message.slice(0, 50)}`;
    }
  }

  const timestamp = typeof payload.timestamp === 'string'
    ? payload.timestamp
    : typeof payload.timestamp === 'number'
    ? new Date(payload.timestamp).toISOString()
    : new Date().toISOString();

  return {
    id: payload.id || generateErrorId(type === 'unhandled_rejection' ? 'reject' : 'run'),
    type,
    title,
    message,
    file,
    line,
    column,
    stack: stack || undefined,
    timestamp,
    rawPayload: payload,
  };
}

// ============================================================================
// Auto-Fix Prompt Generation
// ============================================================================

/**
 * Menghasilkan prompt terstruktur otomatis untuk dikirim ke agen AI agar bug langsung diperbaiki.
 * Mengintegrasikan diagnosa otomatis, lokasi kode, konteks eksekusi, dan panduan arsitektur ArtaStudio.
 *
 * @param error Objek DetectedError yang terdeteksi oleh sensor
 * @returns String instruksi prompt Markdown lengkap dan siap dieksekusi oleh agen AI
 */
export function generateAutoFixPrompt(error: DetectedError): string {
  const isCompile = error.type === 'compile';
  const isRejection = error.type === 'unhandled_rejection';
  const errorCategory = isCompile
    ? 'Kesalahan Kompilasi / Transformasi (Vite Dev Server)'
    : isRejection
    ? 'Unhandled Promise Rejection (Browser Runtime)'
    : 'Kesalahan Runtime / Pengecualian Aplikasi (Browser Preview)';

  // Heuristic diagnostic advice
  const diagnosticHints: string[] = [];

  if (isCompile) {
    diagnosticHints.push('- Periksa sintaksis TypeScript/JSX yang mungkin tidak tertutup atau salah ketik.');
    diagnosticHints.push('- Pastikan import modul, path alias (`@/*`), dan deklarasi tipe terpasang dengan benar.');
    diagnosticHints.push('- Periksa apakah ada referensi variabel atau komponen yang belum diekspor.');
  } else if (isRejection) {
    diagnosticHints.push('- Periksa operasi async/Promise yang tidak memiliki blok `.catch()` atau `try/catch`.');
    diagnosticHints.push('- Periksa panggilan API/fetch: apakah endpoint tersedia dan respon divalidasi sebelum diakses.');
    diagnosticHints.push('- Tangani kegagalan jaringan atau autentikasi secara graceful dengan fallback state.');
  } else {
    // Runtime error
    const msg = error.message.toLowerCase();
    if (msg.includes('undefined') || msg.includes('null') || msg.includes('cannot read property') || msg.includes('cannot read properties')) {
      diagnosticHints.push('- Terdeteksi akses properti pada nilai null/undefined: gunakan optional chaining (`?.`) atau default value (`??`).');
      diagnosticHints.push('- Pastikan state awal React diinisialisasi sebelum komponen merender data dinamis.');
    } else if (msg.includes('rendered more hooks') || msg.includes('rules of hooks') || msg.includes('invalid hook call')) {
      diagnosticHints.push('- Terdeteksi pelanggaran aturan React Hook: pastikan hooks dipanggil di level teratas tanpa kondisi percabangan `if/else` atau loop.');
    } else if (msg.includes('is not a function')) {
      diagnosticHints.push('- Terdeteksi pemanggilan fungsi pada objek non-fungsi: pastikan import dan prop callback bertipe fungsi.');
    } else {
      diagnosticHints.push('- Periksa eksekusi alur data dan render state di komponen terkait.');
      diagnosticHints.push('- Pasang pengaman null-check atau React Error Boundary jika diperlukan.');
    }
  }

  // Location string
  const locationParts: string[] = [];
  if (error.file) {
    locationParts.push(`Berkas: \`${error.file}\``);
  }
  if (error.line !== undefined) {
    locationParts.push(`Baris: \`${error.line}\``);
  }
  if (error.column !== undefined) {
    locationParts.push(`Kolom: \`${error.column}\``);
  }
  const locationString = locationParts.length > 0 ? locationParts.join(' | ') : 'Lokasi berkas spesifik tidak disertakan dalam laporan error.';

  return [
    `# ArtaStudio Auto-Fix Request: ${error.title}`,
    '',
    `Sensor bug ArtaStudio mendeteksi masalah kritis pada proyek. Harap perbaiki bug ini secara langsung dan tuntas.`,
    '',
    `## Ringkasan Error`,
    `- **ID Error**: \`${error.id}\``,
    `- **Kategori**: ${errorCategory}`,
    `- **Tipe**: \`${error.type}\``,
    `- **Waktu Deteksi**: \`${error.timestamp}\``,
    `- **Lokasi**: ${locationString}`,
    '',
    `## Pesan Error`,
    '```',
    error.message,
    '```',
    '',
    error.stack ? `## Stack Trace / Code Frame\n\`\`\`\n${error.stack}\n\`\`\`\n` : '',
    `## Panduan Diagnostik Otomatis`,
    ...diagnosticHints,
    '',
    `## Instruksi Perbaikan Agen AI (Action Plan)`,
    `1. Buka dan pelajari berkas kode yang terdampak ${error.file ? `(\`${error.file}\`)` : 'berdasarkan stack trace di atas'}.`,
    `2. Teliti baris kode yang mengalami anomali dan identifikasi akar masalah (root cause) tanpa membuat asumsi sepihak.`,
    `3. Terapkan solusi perbaikan minimal yang paling aman dan tepat sasaran.`,
    `4. PERATURAN MUTLAK ARTASTUDIO:`,
    `   - DILARANG menggunakan kata terlarang; pertahankan identitas brand ArtaStudio / Studio.`,
    `   - Jangan merusak fungsionalitas lain atau mengubah antarmuka API yang sudah ada.`,
    `5. Pastikan sintaksis TypeScript/React valid dan bebas dari error compile serta runtime lanjutan.`,
  ].filter((line) => line !== null && line !== undefined).join('\n');
}

// ============================================================================
// ErrorSensorService Implementation
// ============================================================================

export class ErrorSensorService extends EventEmitter {
  private errors: DetectedError[] = [];
  private maxStoredErrors: number = 100;
  private viteWsClient: any = null;
  private viteWsReconnectTimer: NodeJS.Timeout | null = null;
  private isViteWsConnecting: boolean = false;
  private viteWsUrl: string = 'ws://localhost:5173';

  constructor(options?: { maxStoredErrors?: number }) {
    super();
    // Default no-op listener to prevent Node.js ERR_UNHANDLED_ERROR when no external listener is registered
    this.on('error', () => {});

    if (options?.maxStoredErrors) {
      this.maxStoredErrors = Math.max(10, options.maxStoredErrors);
    }
  }

  // --------------------------------------------------------------------------
  // Storage & Querying
  // --------------------------------------------------------------------------

  /**
   * Retrieves all detected errors stored in the in-memory buffer (newest first).
   */
  public getErrors(): DetectedError[] {
    return [...this.errors];
  }

  /**
   * Retrieves the latest detected error or undefined if no errors.
   */
  public getLatestError(): DetectedError | undefined {
    return this.errors[0];
  }

  /**
   * Finds an error by its unique identifier.
   */
  public getErrorById(id: string): DetectedError | undefined {
    return this.errors.find((e) => e.id === id);
  }

  /**
   * Clears all stored error records.
   */
  public clearErrors(): void {
    this.errors = [];
    this.emit('cleared');
  }

  /**
   * Ingests, stores, and broadcasts a standardized DetectedError.
   */
  public recordError(errorInput: Omit<DetectedError, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): DetectedError {
    const error: DetectedError = {
      ...errorInput,
      id: errorInput.id || generateErrorId(errorInput.type),
      timestamp: errorInput.timestamp || new Date().toISOString(),
    };

    // Auto-generate autoFixPrompt if not provided
    if (!error.autoFixPrompt) {
      error.autoFixPrompt = generateAutoFixPrompt(error);
    }

    // Prepend to storage buffer (newest first)
    this.errors.unshift(error);
    if (this.errors.length > this.maxStoredErrors) {
      this.errors = this.errors.slice(0, this.maxStoredErrors);
    }

    // Emit event notifications
    this.emit('error', error);
    if (error.type === 'compile') {
      this.emit('compile-error', error);
    } else if (error.type === 'runtime') {
      this.emit('runtime-error', error);
    } else if (error.type === 'unhandled_rejection') {
      this.emit('unhandled-rejection', error);
    }

    return error;
  }

  // --------------------------------------------------------------------------
  // Vite Dev Server WebSocket Integration
  // --------------------------------------------------------------------------

  /**
   * Ingests and processes a raw message from the Vite dev server HMR WebSocket.
   * If the message represents a compile error, standardizes it, records it, and emits it.
   */
  public handleViteMessage(data: string | object): DetectedError | null {
    const parsed = parseViteHmrError(data);
    if (parsed) {
      return this.recordError(parsed);
    }
    return null;
  }

  /**
   * Connects to the Vite dev server HMR WebSocket to capture live compile/transform errors.
   * Automatically handles reconnects if the Vite dev server restarts.
   */
  public connectViteWs(url: string = 'ws://localhost:5173', options?: ViteWsOptions): {
    close: () => void;
    isConnected: () => boolean;
    reconnect: () => void;
  } {
    this.viteWsUrl = url;
    let isClosed = false;
    let reconnectAttempts = 0;
    const initialInterval = options?.reconnectInterval || 2000;
    const maxInterval = options?.maxReconnectInterval || 15000;
    const maxRetries = options?.maxRetries ?? Infinity;

    // Resolve WebSocket constructor
    const WebSocketImpl =
      options?.WebSocketClass ||
      (typeof globalThis !== 'undefined' ? (globalThis as any).WebSocket : null);

    if (!WebSocketImpl) {
      console.warn('[ArtaStudio Sensor] WebSocket client implementation not available in environment.');
      return {
        close: () => {},
        isConnected: () => false,
        reconnect: () => {},
      };
    }

    const connect = () => {
      if (isClosed || this.isViteWsConnecting) return;
      this.isViteWsConnecting = true;

      try {
        // Connect to Vite HMR with the 'vite-hmr' subprotocol if supported
        const client = new WebSocketImpl(this.viteWsUrl, 'vite-hmr');
        this.viteWsClient = client;

        client.onopen = () => {
          this.isViteWsConnecting = false;
          reconnectAttempts = 0;
          options?.onConnect?.();
        };

        client.onmessage = (event: any) => {
          const rawData = event.data;
          this.handleViteMessage(rawData);
        };

        client.onerror = (err: any) => {
          this.isViteWsConnecting = false;
          options?.onError?.(err);
        };

        client.onclose = () => {
          this.isViteWsConnecting = false;
          this.viteWsClient = null;
          options?.onDisconnect?.();

          if (!isClosed && reconnectAttempts < maxRetries) {
            reconnectAttempts++;
            const delay = Math.min(initialInterval * Math.pow(1.5, reconnectAttempts - 1), maxInterval);
            this.viteWsReconnectTimer = setTimeout(connect, delay);
          }
        };
      } catch (err) {
        this.isViteWsConnecting = false;
        options?.onError?.(err);
        if (!isClosed && reconnectAttempts < maxRetries) {
          reconnectAttempts++;
          this.viteWsReconnectTimer = setTimeout(connect, initialInterval);
        }
      }
    };

    connect();

    return {
      close: () => {
        isClosed = true;
        if (this.viteWsReconnectTimer) {
          clearTimeout(this.viteWsReconnectTimer);
          this.viteWsReconnectTimer = null;
        }
        if (this.viteWsClient) {
          try {
            this.viteWsClient.close();
          } catch {
            // ignore
          }
          this.viteWsClient = null;
        }
      },
      isConnected: () => {
        return Boolean(this.viteWsClient && this.viteWsClient.readyState === 1);
      },
      reconnect: () => {
        if (this.viteWsClient) {
          try {
            this.viteWsClient.close();
          } catch {
            // ignore
          }
        }
        connect();
      },
    };
  }

  // --------------------------------------------------------------------------
  // Runtime Error Ingestion (iframe / browser)
  // --------------------------------------------------------------------------

  /**
   * Processes runtime error report payload from browser iframe or REST endpoint.
   * Standardizes into DetectedError, generates autoFixPrompt, and stores it.
   */
  public handleRuntimeErrorPayload(payload: RuntimeErrorPayload): DetectedError {
    const normalized = normalizeRuntimeError(payload);
    return this.recordError(normalized);
  }

  /**
   * Event subscription helper for convenience.
   */
  public subscribe(listener: (error: DetectedError) => void): () => void {
    this.on('error', listener);
    return () => {
      this.off('error', listener);
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const errorSensorService = new ErrorSensorService();

// ============================================================================
// REST Endpoint Handlers (Express, Node http, Fetch API)
// ============================================================================

/**
 * Express handler for POST /api/sensor/runtime-error
 * Ingests runtime errors reported by preview iframe or browser client.
 */
export async function handleRuntimeErrorEndpoint(req: Request, res: Response): Promise<void> {
  try {
    let payload = req.body;

    // Fallback if body parser was not configured
    if (!payload && typeof (req as any).on === 'function') {
      payload = await new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch {
            resolve({});
          }
        });
      });
    }

    if (!payload || typeof payload !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Invalid request body. Expected JSON object with error details.',
      });
      return;
    }

    const recorded = errorSensorService.handleRuntimeErrorPayload(payload);

    res.status(200).json({
      success: true,
      data: recorded,
      error: recorded,
      autoFixPrompt: recorded.autoFixPrompt,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to process runtime error report',
    });
  }
}

/**
 * Express handler for GET /api/sensor/errors
 */
export function handleGetErrorsEndpoint(_req: Request, res: Response): void {
  const errors = errorSensorService.getErrors();
  res.status(200).json({
    success: true,
    data: errors,
    total: errors.length,
  });
}

/**
 * Express handler for GET /api/sensor/errors/latest
 */
export function handleGetLatestErrorEndpoint(_req: Request, res: Response): void {
  const latest = errorSensorService.getLatestError();
  res.status(200).json({
    success: true,
    data: latest || null,
  });
}

/**
 * Express handler for DELETE /api/sensor/errors
 */
export function handleClearErrorsEndpoint(_req: Request, res: Response): void {
  errorSensorService.clearErrors();
  res.status(200).json({
    success: true,
    message: 'Seluruh riwayat error sensor berhasil dibersihkan.',
  });
}

/**
 * Express handler for POST /api/sensor/auto-fix-prompt
 * Generates an auto-fix prompt for a given error payload or error ID.
 */
export function handleGeneratePromptEndpoint(req: Request, res: Response): void {
  try {
    const errorId = req.body?.id || req.body?.errorId;
    let targetError: DetectedError | undefined;

    if (errorId) {
      targetError = errorSensorService.getErrorById(errorId);
    }

    if (!targetError && req.body?.message) {
      targetError = normalizeRuntimeError(req.body);
    }

    if (!targetError) {
      targetError = errorSensorService.getLatestError();
    }

    if (!targetError) {
      res.status(404).json({
        success: false,
        error: 'Error tidak ditemukan untuk menghasilkan prompt auto-fix.',
      });
      return;
    }

    const prompt = generateAutoFixPrompt(targetError);
    res.status(200).json({
      success: true,
      data: {
        error: targetError,
        autoFixPrompt: prompt,
      },
      prompt,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Gagal menghasilkan auto-fix prompt',
    });
  }
}

/**
 * Creates and configures the Express router for ArtaStudio Error Sensor.
 * Can be mounted at /api/sensor or /api/sensor/runtime-error.
 */
export function createErrorSensorRouter(): Router {
  const router = express.Router();

  // Primary endpoint required by specification: POST /api/sensor/runtime-error
  router.post('/runtime-error', handleRuntimeErrorEndpoint);

  // Additional REST endpoints for complete sensor management
  router.post('/', handleRuntimeErrorEndpoint);
  router.get('/', handleGetErrorsEndpoint);
  router.get('/errors', handleGetErrorsEndpoint);
  router.get('/errors/latest', handleGetLatestErrorEndpoint);
  router.get('/latest', handleGetLatestErrorEndpoint);
  router.delete('/errors', handleClearErrorsEndpoint);
  router.delete('/', handleClearErrorsEndpoint);
  router.post('/auto-fix-prompt', handleGeneratePromptEndpoint);

  return router;
}

export const errorSensorRouter = createErrorSensorRouter();

/**
 * Standalone Node.js native HTTP request handler for environments without Express.
 * Returns true if the request was handled by this endpoint, false otherwise.
 */
export async function handleNativeHttpRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url || '';
  const pathname = url.split('?')[0];

  if (pathname === '/api/sensor/runtime-error' && req.method === 'POST') {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const recorded = errorSensorService.handleRuntimeErrorPayload(parsed);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              data: recorded,
              error: recorded,
              autoFixPrompt: recorded.autoFixPrompt,
            })
          );
          resolve(true);
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
          resolve(true);
        }
      });
    });
  }

  return false;
}

/**
 * Web Fetch API handler for modern Edge/Fetch runtimes (Nitro, Cloudflare Workers, Bun).
 */
export async function handleFetchRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/sensor/runtime-error' && request.method === 'POST') {
    try {
      const payload = await request.json();
      const recorded = errorSensorService.handleRuntimeErrorPayload(payload);
      return new Response(
        JSON.stringify({
          success: true,
          data: recorded,
          error: recorded,
          autoFixPrompt: recorded.autoFixPrompt,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return null;
}

export default errorSensorService;
