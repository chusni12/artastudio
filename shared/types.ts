/**
 * ArtaStudio - Workspace Discovery Service Types
 * Defines interfaces and types for workspace project discovery and management.
 */

export type ProjectStatus = 'idle' | 'running';

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  framework: string;
  hasGit: boolean;
  currentBranch?: string;
  activeDevPort?: number;
  status: ProjectStatus;
  lastModified: string;
}

export interface ProjectPackageJson {
  name?: string;
  version?: string;
  description?: string;
  type?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface ProjectDetail extends ProjectInfo {
  packageJson?: ProjectPackageJson;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  isGitWorktree?: boolean;
  gitRemoteUrl?: string;
  portsDetected?: number[];
  detectedConfigs?: string[];
}

export interface WorkspaceScanOptions {
  rootPath?: string;
  maxDepth?: number;
  checkActivePorts?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}
