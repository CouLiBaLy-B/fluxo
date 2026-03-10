// ═══════════════════════════════════════════════════════════════════════════════
// Types de base — domaine métier
// ═══════════════════════════════════════════════════════════════════════════════

export type Priority    = 'lowest' | 'low' | 'medium' | 'high' | 'highest';
export type IssueType   = 'story' | 'bug' | 'task' | 'epic' | 'subtask';
export type Status      = 'backlog' | 'todo' | 'in-progress' | 'in-review' | 'done';
export type AppView     = 'jira' | 'confluence';
export type ProjectType = 'software' | 'business' | 'service';
export type JiraBoardView = 'board' | 'backlog' | 'roadmap' | 'settings';
export type UserRole    = 'admin' | 'member' | 'viewer';

// ═══════════════════════════════════════════════════════════════════════════════
// Authentification
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuthUser {
  id: string;
  name: string;
  avatar: string;
  color: string;
  email: string;
  role: UserRole;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utilisateurs
// ═══════════════════════════════════════════════════════════════════════════════

export interface JiraUser {
  id: string;
  name: string;
  avatar: string;
  color: string;
  email: string;
  role?: UserRole;
  createdAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Issues & Commentaires
// ═══════════════════════════════════════════════════════════════════════════════

export interface JiraComment {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  projectId: string;
  sprintId: string | null;
  type: IssueType;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  assigneeColor: string | null;
  reporterId: string | null;
  reporterName: string | null;
  storyPoints: number;
  labels: string[];
  epicKey: string | null;
  boardOrder: number;
  comments: JiraComment[];
  createdAt: string;
  updatedAt: string;
  // AI agent fields (populated by backend when assigned)
  assignedAgentId?: string | null;
  aiProgress?: number;
}

// Payload pour créer/modifier une issue
export interface IssueFormData {
  key?: string;
  projectId: string;
  sprintId?: string | null;
  type?: IssueType;
  title: string;
  description?: string;
  priority?: Priority;
  status?: Status;
  assigneeId?: string | null;
  reporterId?: string | null;
  storyPoints?: number;
  labels?: string[];
  epicKey?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sprints
// ═══════════════════════════════════════════════════════════════════════════════

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  issueCount: number;
  doneCount: number;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Projets
// ═══════════════════════════════════════════════════════════════════════════════

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description: string;
  leadId: string | null;
  leadName: string | null;
  type: ProjectType;
  color: string;
  emoji: string;
  issueCount: number;
  sprintCount: number;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Confluence
// ═══════════════════════════════════════════════════════════════════════════════

/** Type de panneau Confluence (info/warning/error/success/note) */
export type InfoPanelType = 'info' | 'success' | 'warning' | 'error' | 'note';

/** Niveau de titre dans l'éditeur TipTap */
export type HeadingLevel = 1 | 2 | 3 | 4;

/** Statut de sauvegarde automatique de l'éditeur */
export type EditorSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ConfluencePage {
  id: string;
  spaceId: string;
  spaceKey: string;
  parentId: string | null;
  title: string;
  /** Contenu de la page — peut être Markdown (ancien format) ou HTML TipTap */
  content: string;
  authorId: string | null;
  authorName: string | null;
  tags: string[];
  emoji: string;
  likes: number;
  views: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  ownerId: string | null;
  pages: ConfluencePage[];
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notifications
// ═══════════════════════════════════════════════════════════════════════════════

export interface Notification {
  id: string;
  type: 'issue_assigned' | 'issue_comment' | 'issue_status' | 'sprint_started' | 'page_updated';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Réponse d'erreur standard de l'API */
export interface ApiError {
  error: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

/** Item de réordonnancement pour le drag & drop */
export interface ReorderItem {
  id: string;
  boardOrder: number;
  status?: Status;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agents AI
// ═══════════════════════════════════════════════════════════════════════════════

export type AgentType =
  | 'developer'
  | 'qa'
  | 'writer'
  | 'researcher'
  | 'architect';

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error';

export type TaskQueueStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ArtifactType = 'code' | 'test' | 'doc' | 'report' | 'diagram';
export type LogLevel = 'info' | 'warning' | 'error' | 'success';

export interface AIAgent {
  id: string;
  name: string;
  slug: string;
  type: AgentType;
  description: string;
  avatarEmoji: string;
  avatarColor: string;
  model: string;
  capabilities: string[];
  isActive: boolean;
  maxConcurrentTasks: number;
  createdAt: string;
  currentTasks?: number;
  completedToday?: number;
  totalTokensUsed?: number;
  avgDurationMs?: number;
  status?: AgentStatus;
}

export interface AITaskQueue {
  id: string;
  issueId: string;
  agentId: string;
  agent?: AIAgent;
  status: TaskQueueStatus;
  priority: number;
  instructions: string;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentLog {
  id: string;
  taskQueueId: string;
  agentId: string;
  issueId: string;
  level: LogLevel;
  step: string;
  message: string;
  progress?: number;
  tokensUsed: number;
  durationMs?: number;
  createdAt: string;
}

export interface AgentArtifact {
  id: string;
  taskQueueId: string;
  issueId: string;
  agentId: string;
  type: ArtifactType;
  filename: string;
  content: string;
  language?: string;
  createdAt: string;
}

export interface JiraIssueAI {
  assignedAgentId?: string | null;
  assignedAgent?: AIAgent | null;
  aiInstructions?: string | null;
  aiProgress?: number;
  aiSummary?: string | null;
  confluencePageId?: string | null;
  activeTask?: AITaskQueue | null;
}

export type AgentWSEvent =
  | { type: 'agent:started';         issueId: string; agentId: string; agentName: string; taskQueueId: string }
  | { type: 'agent:progress';        issueId: string; progress: number; step: string; message: string; taskQueueId: string }
  | { type: 'agent:log';             issueId: string; log: AgentLog }
  | { type: 'agent:artifact';        issueId: string; artifact: AgentArtifact }
  | { type: 'agent:completed';       issueId: string; summary: string; confluencePageId?: string; taskQueueId: string }
  | { type: 'agent:failed';          issueId: string; error: string; retryIn?: number; taskQueueId: string }
  | { type: 'issue:status_changed';  issueId: string; from: string; to: string }
  | { type: 'buffer';                events: AgentWSEvent[] };

export interface AssignAgentPayload {
  agentId: string;
  instructions?: string;
  autoStart?: boolean;
  autoConfluence?: boolean;
}
