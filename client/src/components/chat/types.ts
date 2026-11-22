export type MessageSender = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  avatar?: string;
  metadata?: {
    model?: string;
    tokens?: number;
    responseTimeMs?: number;
  };
}

export interface FileDiff {
  path: string;
  status: 'modified' | 'added' | 'deleted';
  additions: number;
  deletions: number;
  patch?: string; // Unified diff content snippet
}

export interface CommitItem {
  id: string;
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  timestamp: string;
  branch?: string;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  diffSummary?: FileDiff[];
  isCurrentPreview?: boolean;
}

export interface SensorErrorItem {
  id: string;
  type: 'compile' | 'runtime' | 'unhandled_rejection';
  title: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: string;
  autoFixPrompt?: string;
}

export type AIStatusState = 'idle' | 'analyzing' | 'coding' | 'building' | 'deploying' | 'error';

export interface AIStatus {
  state: AIStatusState;
  message: string;
}

export type TimelineItem =
  | { type: 'message'; data: ChatMessage }
  | { type: 'commit'; data: CommitItem }
  | { type: 'error'; data: SensorErrorItem };

export interface ChatPanelProps {
  // Feed data
  messages?: ChatMessage[];
  commits?: CommitItem[];
  timelineItems?: TimelineItem[];
  activeErrors?: SensorErrorItem[];

  // Current preview state
  activePreviewCommitHash?: string;

  // AI state
  aiStatus?: AIStatusState;
  aiStatusMessage?: string;

  // Action callbacks
  onSendMessage?: (content: string) => void;
  onAutoFixError?: (error: SensorErrorItem) => void;
  onViewCommitDetail?: (commit: CommitItem) => void;
  onPreviewCommit?: (commit: CommitItem) => void;
  onClearErrors?: () => void;
  onClearChat?: () => void;

  // Visual layout
  projectName?: string;
  currentBranch?: string;
  className?: string;
}
