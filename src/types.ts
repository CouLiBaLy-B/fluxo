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

export interface ConfluencePage {
  id: string;
  spaceId: string;
  spaceKey: string;
  parentId: string | null;
  title: string;
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
