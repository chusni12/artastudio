/**
 * ArtaStudio - Error Sensor Snippet
 *
 * Modul 3: Skrip JavaScript ringan yang siap disuntikkan ke preview iframe
 * untuk menangkap runtime error (window.onerror, unhandled promise rejection,
 * console.error) dan mengirimkannya via window.parent.postMessage ke parent window
 * serta ke endpoint POST /api/sensor/runtime-error.
 */

import type { DetectedError } from '../../../server/services/errorSensorService';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface SensorSnippetOptions {
  /**
   * Endpoint REST backend untuk pengiriman error (default: '/api/sensor/runtime-error')
   */
  apiEndpoint?: string;

  /**
   * Target origin untuk window.parent.postMessage (default: '*')
   */
  targetOrigin?: string;

  /**
   * Mengaktifkan intersepsi console.error (default: true)
   */
  enableConsoleInterception?: boolean;

  /**
   * Mengaktifkan pelaporan ke backend via fetch (default: true)
   */
  enableBackendReporting?: boolean;

  /**
   * Mengaktifkan pengiriman ke parent iframe via postMessage (default: true)
   */
  enablePostMessage?: boolean;

  /**
   * Batas maksimum pengiriman error per menit untuk mencegah browser freezing (default: 30)
   */
  maxErrorsPerMinute?: number;

  /**
   * Jendela waktu (ms) untuk deduping error identik (default: 2000)
   */
  dedupWindowMs?: number;
}

export interface SensorPostMessageData {
  type: string;
  event?: string;
  payload?: Partial<DetectedError>;
  id?: string;
  message?: string;
  source?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  line?: number;
  column?: number;
  stack?: string;
  timestamp?: string | number;
  errorType?: string;
  [key: string]: unknown;
}

// ============================================================================
// Snippet Generator Function
// ============================================================================

/**
 * Menghasilkan kode JavaScript executable dalam bentuk string siap disuntikkan ke
 * HTML preview iframe (dalam tag <script>).
 *
 * @param options Konfigurasi sensor snippet
 * @returns String kode JavaScript murni tanpa dependensi eksternal
 */
export function getSensorSnippet(options: SensorSnippetOptions = {}): string {
  const apiEndpoint = options.apiEndpoint ?? '/api/sensor/runtime-error';
  const targetOrigin = options.targetOrigin ?? '*';
  const enableConsole = options.enableConsoleInterception !== false;
  const enableBackend = options.enableBackendReporting !== false;
  const enablePostMessage = options.enablePostMessage !== false;
  const maxErrorsPerMinute = options.maxErrorsPerMinute ?? 30;
  const dedupWindowMs = options.dedupWindowMs ?? 2000;

  return `(function() {
  if (typeof window === 'undefined' || window.__ARTASTUDIO_SENSOR_ACTIVE__) return;
  window.__ARTASTUDIO_SENSOR_ACTIVE__ = true;

  var API_ENDPOINT = ${JSON.stringify(apiEndpoint)};
  var TARGET_ORIGIN = ${JSON.stringify(targetOrigin)};
  var ENABLE_CONSOLE = ${enableConsole ? 'true' : 'false'};
  var ENABLE_BACKEND = ${enableBackend ? 'true' : 'false'};
  var ENABLE_POST_MESSAGE = ${enablePostMessage ? 'true' : 'false'};
  var MAX_ERRORS_PER_MIN = ${maxErrorsPerMinute};
  var DEDUP_WINDOW_MS = ${dedupWindowMs};

  var errorCount = 0;
  var minuteStart = Date.now();
  var recentErrors = {};

  function isRateLimited() {
    var now = Date.now();
    if (now - minuteStart > 60000) {
      minuteStart = now;
      errorCount = 0;
    }
    if (errorCount >= MAX_ERRORS_PER_MIN) {
      return true;
    }
    errorCount++;
    return false;
  }

  function isDuplicate(key) {
    var now = Date.now();
    if (recentErrors[key] && (now - recentErrors[key] < DEDUP_WINDOW_MS)) {
      return true;
    }
    recentErrors[key] = now;
    return false;
  }

  function reportError(data) {
    if (!data || !data.message) return;
    if (isRateLimited()) return;

    var dedupKey = (data.type || '') + ':' + (data.message || '') + ':' + (data.file || data.source || '') + ':' + (data.line || data.lineno || 0);
    if (isDuplicate(dedupKey)) return;

    var nowIso = new Date().toISOString();
    var nowMs = Date.now();
    var errorId = 'err_' + nowMs + '_' + Math.random().toString(36).substring(2, 7);

    var errorPayload = {
      id: errorId,
      type: data.type || 'runtime',
      title: data.title || (data.type === 'unhandled_rejection' ? 'Unhandled Promise Rejection' : 'Runtime Error'),
      message: String(data.message),
      file: data.file || data.source || data.filename || undefined,
      source: data.file || data.source || data.filename || undefined,
      line: typeof data.line === 'number' ? data.line : (typeof data.lineno === 'number' ? data.lineno : undefined),
      lineno: typeof data.line === 'number' ? data.line : (typeof data.lineno === 'number' ? data.lineno : undefined),
      column: typeof data.column === 'number' ? data.column : (typeof data.colno === 'number' ? data.colno : undefined),
      colno: typeof data.column === 'number' ? data.column : (typeof data.colno === 'number' ? data.colno : undefined),
      stack: data.stack ? String(data.stack) : undefined,
      timestamp: nowIso,
      timestampMs: nowMs
    };

    // 1. Dispatch to parent window via postMessage
    if (ENABLE_POST_MESSAGE && window.parent && window.parent !== window) {
      try {
        var postData = {
          type: 'STUDIO_ERROR',
          event: 'ARTASTUDIO_RUNTIME_ERROR',
          payload: errorPayload,
          id: errorPayload.id,
          message: errorPayload.message,
          source: errorPayload.file,
          filename: errorPayload.file,
          lineno: errorPayload.line,
          colno: errorPayload.column,
          line: errorPayload.line,
          column: errorPayload.column,
          stack: errorPayload.stack,
          timestamp: nowMs,
          errorType: errorPayload.type
        };
        window.parent.postMessage(postData, TARGET_ORIGIN);
      } catch (errPost) {
        // Safe fallback
      }
    }

    // 2. Dispatch to backend endpoint via fetch
    if (ENABLE_BACKEND && API_ENDPOINT && typeof fetch === 'function') {
      try {
        fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorPayload),
          mode: 'cors',
          credentials: 'omit'
        }).catch(function() {
          // Network errors ignored inside preview frame
        });
      } catch (errFetch) {
        // Safe fallback
      }
    }
  }

  // Hook standard window.onerror and ErrorEvent
  window.addEventListener('error', function(event) {
    if (!event) return;

    // Filter resource load error on elements (like <img src="...">)
    var target = event.target || event.srcElement;
    if (target && (target instanceof HTMLElement) && target !== window) {
      var tagName = target.tagName ? target.tagName.toLowerCase() : 'element';
      var sourceUrl = target.src || target.href || '';
      reportError({
        type: 'runtime',
        title: 'Resource Loading Error: ' + tagName,
        message: 'Gagal memuat sumber daya <' + tagName + '> dari URL: ' + sourceUrl,
        file: sourceUrl,
        stack: 'Failed to load resource: the server responded with an error for <' + tagName + ' src="' + sourceUrl + '">'
      });
      return;
    }

    var msg = event.message || (event.error && event.error.message) || String(event);
    var file = event.filename || '';
    var line = event.lineno || undefined;
    var col = event.colno || undefined;
    var stack = (event.error && event.error.stack) || '';

    reportError({
      type: 'runtime',
      title: 'Runtime Error: ' + msg.slice(0, 50),
      message: msg,
      file: file,
      line: line,
      column: col,
      stack: stack
    });
  });

  // Hook unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    if (!event) return;
    var reason = event.reason;
    var msg = '';
    var stack = '';

    if (reason instanceof Error) {
      msg = reason.message || 'Unhandled Promise Rejection';
      stack = reason.stack || '';
    } else if (typeof reason === 'string') {
      msg = reason;
    } else if (reason && typeof reason === 'object') {
      msg = reason.message || JSON.stringify(reason);
      stack = reason.stack || '';
    } else {
      msg = String(reason || 'Unhandled Promise Rejection');
    }

    reportError({
      type: 'unhandled_rejection',
      title: 'Unhandled Rejection: ' + msg.slice(0, 50),
      message: msg,
      stack: stack
    });
  });

  // Hook console.error for React uncaught render errors
  if (ENABLE_CONSOLE && typeof console !== 'undefined' && console.error) {
    var originalConsoleError = console.error;
    console.error = function() {
      try {
        var args = Array.prototype.slice.call(arguments);
        var combinedMsg = args.map(function(arg) {
          if (arg instanceof Error) return arg.message + (arg.stack ? '\\n' + arg.stack : '');
          if (typeof arg === 'object') {
            try { return JSON.stringify(arg); } catch(e) { return String(arg); }
          }
          return String(arg);
        }).join(' ');

        // Check if message indicates an uncaught React error boundary or fatal error
        if (combinedMsg.indexOf('The above error occurred in the') !== -1 ||
            combinedMsg.indexOf('Uncaught') !== -1 ||
            combinedMsg.indexOf('Error:') !== -1) {
          reportError({
            type: 'runtime',
            title: 'Console Error Intercepted',
            message: combinedMsg.slice(0, 200),
            stack: combinedMsg
          });
        }
      } catch (errConsole) {
        // Ignore inspection errors
      }

      return originalConsoleError.apply(console, arguments);
    };
  }
})();`;
}

/**
 * Script string JavaScript default yang siap disuntikkan langsung ke preview iframe.
 */
export const SENSOR_SNIPPET: string = getSensorSnippet();

/**
 * Menghasilkan tag HTML <script> lengkap berisi sensor snippet untuk injeksi langsung ke template HTML.
 */
export function getSensorScriptTag(options?: SensorSnippetOptions): string {
  return `<script id="artastudio-error-sensor">\n${getSensorSnippet(options)}\n</script>`;
}

// ============================================================================
// Parent Window Message Listeners & Parsers (Client Helper)
// ============================================================================

/**
 * Memeriksa apakah event postMessage berasal dari Error Sensor ArtaStudio.
 */
export function isSensorMessage(event: MessageEvent): boolean {
  if (!event || !event.data || typeof event.data !== 'object') return false;
  const data = event.data as SensorPostMessageData;
  return (
    data.type === 'STUDIO_ERROR' ||
    data.type === 'PREVIEW_ERROR' ||
    data.event === 'ARTASTUDIO_RUNTIME_ERROR' ||
    data.type === 'CONSOLE_ERROR' ||
    data.type === 'UNCAUGHT_ERROR'
  );
}

/**
 * Mengekstrak dan menstandardisasi objek DetectedError dari event postMessage iframe.
 */
export function extractErrorFromMessage(event: MessageEvent): DetectedError | null {
  if (!isSensorMessage(event)) return null;

  const data = event.data as SensorPostMessageData;
  const payload = (data.payload || data) as any;

  const message = payload.message || data.message || 'Unknown runtime error';
  const file = payload.file || payload.source || payload.filename || data.source || data.filename;
  const line = payload.line ?? payload.lineno ?? data.line ?? data.lineno;
  const column = payload.column ?? payload.colno ?? data.column ?? data.colno;
  const stack = payload.stack || data.stack;

  let type: 'compile' | 'runtime' | 'unhandled_rejection' = 'runtime';
  if (payload.type === 'compile' || data.type === 'compile') {
    type = 'compile';
  } else if (payload.type === 'unhandled_rejection' || data.type === 'unhandled_rejection') {
    type = 'unhandled_rejection';
  }

  const baseTitle = file
    ? `${type === 'unhandled_rejection' ? 'Unhandled Rejection' : 'Runtime Error'} pada ${file.split(/[/\\]/).pop()}`
    : payload.title || (type === 'unhandled_rejection' ? 'Unhandled Promise Rejection' : 'Runtime Error');

  return {
    id: payload.id || data.id || `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    title: baseTitle,
    message: String(message),
    file: file ? String(file) : undefined,
    line: typeof line === 'number' && !isNaN(line) ? line : undefined,
    column: typeof column === 'number' && !isNaN(column) ? column : undefined,
    stack: stack ? String(stack) : undefined,
    timestamp: typeof payload.timestamp === 'string'
      ? payload.timestamp
      : new Date(payload.timestamp || data.timestamp || Date.now()).toISOString(),
  };
}

/**
 * Helper untuk mendaftarkan listener message pada parent window yang secara otomatis
 * memfilter dan meneruskan objek DetectedError yang valid.
 */
export function createSensorMessageListener(
  callback: (error: DetectedError) => void
): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    const error = extractErrorFromMessage(event);
    if (error) {
      callback(error);
    }
  };
}

export default SENSOR_SNIPPET;
