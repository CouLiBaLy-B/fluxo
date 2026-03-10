// ═══════════════════════════════════════════════════════════════════════════════
// Types TypeScript — Agents AI
// ═══════════════════════════════════════════════════════════════════════════════

// ── Types de base ──────────────────────────────────────────────────────────────

export type AgentType =
  | 'developer'
  | 'qa'
  | 'writer'
  | 'researcher'
  | 'architect';

export type AgentStatus =
  | 'idle'      // libre, en attente de tâches
  | 'running'   // en cours d'exécution
  | 'paused'    // mis en pause
  | 'error';    // en erreur

export type TaskQueueStatus =
  | 'pending'    // en file d'attente
  | 'running'    // en cours
  | 'paused'     // pause
  | 'completed'  // terminé avec succès
  | 'failed'     // échec
  | 'cancelled'; // annulé par le PM

export type ArtifactType = 'code' | 'test' | 'doc' | 'report' | 'diagram';
export type LogLevel = 'info' | 'warning' | 'error' | 'success';

// ── Entités base de données ────────────────────────────────────────────────────

export interface AIAgent {
  id: string;
  name: string;
  slug: string;
  type: AgentType;
  description: string;
  avatarEmoji: string;
  avatarColor: string;
  model: string;
  systemPrompt: string;
  capabilities: string[];
  isActive: boolean;
  maxConcurrentTasks: number;
  createdAt: string;
  // Champs calculés dynamiquement (non persistés)
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
  context: Record<string, unknown>;
  progress: number; // 0 à 100
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
  artifacts: unknown[];
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
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface IssueConfluenceLink {
  id: string;
  issueId: string;
  pageId: string;
  linkType: 'generated' | 'manual' | 'referenced';
  createdByAgentId?: string;
  createdAt: string;
}

export interface ProjectAgentConfig {
  id: string;
  projectId: string;
  agentId: string;
  isEnabled: boolean;
  autoAssign: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}

// ── Résultat d'exécution d'un agent ───────────────────────────────────────────

export interface AgentResult {
  success: boolean;
  summary: string;
  artifacts: Omit<AgentArtifact, 'id' | 'taskQueueId' | 'issueId' | 'agentId' | 'createdAt'>[];
  tokensUsed: number;
  durationMs: number;
  error?: string;
}

// ── Progression émise via WebSocket ───────────────────────────────────────────

export interface AgentProgress {
  issueId: string;
  taskQueueId: string;
  agentId: string;
  progress: number;
  step: string;
  message: string;
  level: LogLevel;
}

// ── Events WebSocket ───────────────────────────────────────────────────────────

export type AgentWSEvent =
  | { type: 'agent:started';         issueId: string; agentId: string; agentName: string; taskQueueId: string }
  | { type: 'agent:progress';        issueId: string; progress: number; step: string; message: string; taskQueueId: string }
  | { type: 'agent:log';             issueId: string; log: AgentLog }
  | { type: 'agent:artifact';        issueId: string; artifact: AgentArtifact }
  | { type: 'agent:completed';       issueId: string; summary: string; confluencePageId?: string; taskQueueId: string }
  | { type: 'agent:failed';          issueId: string; error: string; retryIn?: number; taskQueueId: string }
  | { type: 'issue:status_changed';  issueId: string; from: string; to: string };

// ── Config de l'orchestrateur ─────────────────────────────────────────────────

export interface OrchestratorConfig {
  maxConcurrentTasks: number;  // default: 10
  taskTimeoutMs: number;       // default: 300000 (5 min)
  retryDelayMs: number;        // default: 5000
  autoSelectAgent: boolean;    // utiliser LLM pour choisir l'agent
}

// ── Config LLM ────────────────────────────────────────────────────────────────

export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'gemini'
  | 'mistral'
  | 'cohere'
  | 'groq'
  | 'huggingface'
  | 'azure-openai'
  | 'mock';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  temperature: number;  // 0.1 pour code, 0.7 pour rédaction
  maxTokens: number;
  streaming: boolean;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
  model: string;
  durationMs: number;
}

// ── Payload pour les endpoints REST ───────────────────────────────────────────

export interface AssignAgentPayload {
  agentId: string;
  instructions?: string;
  autoStart?: boolean;
  autoConfluence?: boolean;
}

export interface CreateAgentPayload {
  name: string;
  slug: string;
  type: AgentType;
  description?: string;
  avatarEmoji?: string;
  avatarColor?: string;
  model?: string;
  systemPrompt?: string;
  capabilities?: string[];
  maxConcurrentTasks?: number;
}

export interface UpdateAgentPayload {
  name?: string;
  description?: string;
  avatarEmoji?: string;
  avatarColor?: string;
  model?: string;
  systemPrompt?: string;
  capabilities?: string[];
  isActive?: boolean;
  maxConcurrentTasks?: number;
}

// ── Statistiques d'un agent ────────────────────────────────────────────────────

export interface AgentStats {
  agentId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  runningTasks: number;
  totalTokensUsed: number;
  avgDurationMs: number;
  successRate: number;
  completedToday: number;
}

// ── Métriques globales de la queue ────────────────────────────────────────────

export interface QueueStats {
  totalPending: number;
  totalRunning: number;
  totalCompleted: number;
  totalFailed: number;
  totalCancelled: number;
  agentStats: AgentStats[];
}
