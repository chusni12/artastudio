import type React from 'react';

export type ViewportMode = 'preview' | 'code';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceConfig {
  type: DeviceType;
  name: string;
  width: number | string;
  height: number | string;
  aspectRatio?: string;
  label: string;
}

export interface PreviewRoute {
  label: string;
  path: string;
  description?: string;
}

export interface PreviewError {
  id: string;
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  timestamp: number;
}

export interface PreviewViewportProps {
  /**
   * Initial or base URL to preview (default: window.location.origin or 'http://localhost:5173')
   */
  baseUrl?: string;

  /**
   * Initial active path (default: '/')
   */
  initialPath?: string;

  /**
   * Available routes to display in navigation dropdown
   */
  routes?: PreviewRoute[];

  /**
   * Display mode: 'preview' (Pratinjau) or 'code' (Kode / Editor)
   */
  viewMode?: ViewportMode;

  /**
   * Callback when view mode is changed
   */
  onViewModeChange?: (mode: ViewportMode) => void;

  /**
   * Initial or controlled device type: 'mobile' | 'tablet' | 'desktop'
   */
  device?: DeviceType;

  /**
   * Callback when device size is changed
   */
  onDeviceChange?: (device: DeviceType) => void;

  /**
   * Callback fired when an error is caught from the iframe via postMessage
   */
  onError?: (error: PreviewError) => void;

  /**
   * Callback when iframe navigation changes
   */
  onNavigate?: (path: string) => void;

  /**
   * Additional container class names
   */
  className?: string;

  /**
   * Slot content when viewMode is 'code'
   */
  children?: React.ReactNode;
}
