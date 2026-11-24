/**
 * ArtaStudio - Shared Type Definitions
 */

export interface RepoBranch {
  name: string;
  path: string;
  isCurrent?: boolean;
}

export interface RepoProject {
  id: string;
  name: string;
  repoUrl: string;
  defaultPath: string;
  framework: string;
  branches: { name: string; path: string; isCurrent?: boolean }[];
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  framework: string;
  hasGit: boolean;
  currentBranch?: string;
  activeDevPort?: number;
  status: 'idle' | 'running';
  lastModified: string;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  type: 'feat' | 'fix' | 'chore' | 'docs' | 'refactor' | 'other';
}

export interface CommitFileChange {
  path: string;
  insertions: number;
  deletions: number;
}

export interface CommitDiff {
  commitHash: string;
  files: CommitFileChange[];
  rawDiff: string;
}

export interface GitSyncStatus {
  success: boolean;
  isGit: boolean;
  connected: boolean;
  repoName: string;
  repoUrl: string;
  cloneUrls: {
    https: string;
    ssh: string;
    cli: string;
  };
  currentBranch: string;
  branches: string[];
  syncStatus: 'in_sync' | 'behind' | 'ahead' | 'diverged' | 'offline' | 'not_connected' | 'not_git' | 'error';
  syncMessage: string;
  localCommit: string;
  remoteCommit: string | null;
  ahead: number;
  behind: number;
  lastSynced: string;
}

export interface DetectedError {
  id: string;
  type: 'compile' | 'runtime' | 'unhandled_rejection';
  title: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: string;
}

export interface ProcessStatus {
  projectPath: string;
  pid?: number;
  status: 'stopped' | 'starting' | 'running' | 'error';
  port?: number;
  url?: string;
  startTime?: string;
}

export interface ProcessLog {
  timestamp: string;
  type: 'stdout' | 'stderr' | 'system';
  message: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  commitHash?: string;
  status?: 'analyzing' | 'thinking' | 'editing' | 'building' | 'done' | 'error';
  statusMessage?: string;
}

export interface ChatSession {
  id: string;
  projectPath: string;
  messages: ChatMessage[];
  createdAt: string;
}

export interface DeploymentInfo {
  id: string;
  projectPath: string;
  commitHash?: string;
  status: 'pending' | 'building' | 'deploying' | 'succeeded' | 'failed';
  url?: string;
  logs: string[];
  createdAt: string;
}

export type WebSocketChannel = 'logs' | 'errors' | 'chat' | 'system' | 'workspaces' | 'process';

export interface WebSocketEvent<T = unknown> {
  channel: WebSocketChannel;
  event: string;
  data: T;
  timestamp: string;
}

export interface GitCloneProgress {
  stage: 'cloning' | 'counting' | 'compressing' | 'receiving' | 'resolving' | 'updating' | 'done' | 'error';
  percent: number;
  totalMb?: string;
  speed?: string;
  text: string;
  size?: string;
  targetPath?: string;
  success?: boolean;
  error?: string;
}

// Compatibility types for chatBridge and services
export interface CommitItem {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  category?: string;
}

export interface FileDiff {
  file: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
}

export type AIStatusState = 'idle' | 'analyzing' | 'generating' | 'editing' | 'building' | 'deploying';
export type TargetAgent = 'command-code' | 'antigravity';

export interface ChatStreamEvent {
  type: 'status' | 'delta' | 'commit_created' | 'done' | 'error' | 'connected' | 'heartbeat';
  data: any;
}

export interface SendMessageRequest {
  sessionId?: string;
  prompt: string;
  targetAgent?: TargetAgent;
}

export interface SendMessageResponse {
  sessionId: string;
  status: string;
}

export interface StatusEvent {
  status: AIStatusState;
  message: string;
}

export interface TextDeltaEvent {
  delta: string;
}

export interface CommitCreatedEvent {
  commit: CommitItem;
}

export interface DoneEvent {
  totalTokens?: number;
}

export interface ErrorEvent {
  error: string;
}

export interface ConnectedEvent {
  sessionId: string;
}

export interface HeartbeatEvent {
  time: string;
}

export interface ProjectDetail extends ProjectInfo {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface ProjectPackageJson {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export type ProjectStatus = 'idle' | 'running' | 'error';

export interface WorkspaceScanOptions {
  rootPath?: string;
  maxDepth?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Security Audit Pre-Flight Check Types
export type SecurityPillarId = 'database-rls' | 'api-secrets' | 'vulnerable-dependencies' | 'build-integrity';
export type SecurityStatus = 'passed' | 'warning' | 'failed';
export type SecurityFindingLevel = 'info' | 'warning' | 'critical';

export interface SecurityFinding {
  id: string;
  category: SecurityPillarId;
  level: SecurityFindingLevel;
  title: string;
  detail: string;
  file?: string;
  line?: number;
  remediation?: string;
}

export interface SecurityPillarResult {
  id: SecurityPillarId;
  name: string;
  description: string;
  status: SecurityStatus;
  score: number;
  summary: string;
  findings: SecurityFinding[];
  durationMs: number;
}

export interface SecurityAuditSummary {
  totalChecks: number;
  passedChecks: number;
  warnings: number;
  criticals: number;
}

export interface SecurityAuditReport {
  timestamp: string;
  projectPath: string;
  overallStatus: SecurityStatus;
  overallScore: number;
  canDeploy: boolean;
  pillars: SecurityPillarResult[];
  summary: SecurityAuditSummary;
}
