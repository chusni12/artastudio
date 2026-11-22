import React from 'react';

export type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export interface WorkspaceItem {
  id: string;
  name: string;
  description?: string;
  techStack?: string;
  updatedAt: string;
  branch: string;
  isActive?: boolean;
}

export interface GitBranchItem {
  name: string;
  isDefault?: boolean;
  lastCommit?: string;
  updatedAt?: string;
}

export interface DevServerStatus {
  status: 'running' | 'starting' | 'stopped' | 'error';
  port: number;
  url: string;
  uptime?: string;
  latencyMs?: number;
  requestsCount?: number;
}

export interface StudioCommit {
  id: string;
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  timestamp: string;
  branch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface StudioChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  suggestedAction?: string;
}

export type StudioTimelineItem =
  | { type: 'message'; data: StudioChatMessage }
  | { type: 'commit'; data: StudioCommit };

export interface StudioLayoutProps {
  // Brand & Proyek
  projectName?: string;
  projectDescription?: string;
  activeWorkspaceId?: string;
  workspaces?: WorkspaceItem[];
  onWorkspaceChange?: (workspaceId: string) => void;
  onNewWorkspace?: () => void;

  // Git State
  currentBranch?: string;
  branches?: GitBranchItem[];
  onBranchChange?: (branchName: string) => void;
  onCreateBranch?: (newBranchName: string) => void;

  // Dev Server
  devServerStatus?: DevServerStatus;
  onRestartDevServer?: () => void;
  onStopDevServer?: () => void;

  // Header Actions
  onPublishToEdge?: () => Promise<void> | void;
  onShare?: () => void;
  isPublishing?: boolean;

  // Kolom Tengah (Chat) Custom Slot & Props
  chatPanel?: React.ReactNode;
  timelineItems?: StudioTimelineItem[];
  onSendMessage?: (prompt: string) => void;
  isAiThinking?: boolean;

  // Kolom Kanan (Live Preview) Custom Slot & Props
  previewPanel?: React.ReactNode;
  previewUrl?: string;
  onRefreshPreview?: () => void;

  // Custom Sidebar Slot
  sidebarPanel?: React.ReactNode;

  // Styling & Container
  className?: string;
}
