// ─── Client API — communication avec le backend Express ──────────────────────
// En développement (Vite) : /api est proxié vers localhost:4000
// En production (Docker/Nginx) : /api est proxié vers backend:4000

import type {
  JiraProject,
  JiraIssue,
  JiraUser,
  Sprint,
  ConfluenceSpace,
  ConfluencePage,
  IssueFormData,
  ReorderItem,
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  ApiError,
  AIAgent,
  AITaskQueue,
  AgentLog,
  AgentArtifact,
  AssignAgentPayload,
} from '../types';

const BASE = '/api';

/**
 * Récupère le token JWT depuis le localStorage.
 */
function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

/**
 * Classe d'erreur API avec le code et les détails.
 */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiError['details']
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Fonction de requête générique.
 * Injecte automatiquement le token JWT Bearer si disponible.
 * Redirige vers /login en cas de 401.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });

  // 401 → token expiré ou invalide → rediriger vers login
  if (res.status === 401) {
    console.error('🔐 Authentification échouée (401)', { path, token: !!token });
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    // Utiliser window.location pour déclencher un rechargement complet
    if (!path.startsWith('/auth')) {
      console.error('🔴 REDIRECTION vers /login causée par 401 sur', path);
      window.location.href = '/login';
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => ({})) as ApiError & T;

  if (!res.ok) {
    console.error('❌ Erreur API:', { path, status: res.status, code: body.error, message: body.message });
    throw new ApiRequestError(
      res.status,
      body.error ?? `HTTP_${res.status}`,
      body.message ?? `Erreur HTTP ${res.status}`,
      body.details
    );
  }

  return body;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const api = {
  // ── Authentification ────────────────────────────────────────────────────────
  auth: {
    login:    (credentials: LoginCredentials) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
    register: (credentials: RegisterCredentials) =>
      request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(credentials) }),
    me: () =>
      request<{ user: AuthResponse['user'] }>('/auth/me'),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      request<void>('/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),
  },

  // ── Projets ─────────────────────────────────────────────────────────────────
  projects: {
    list:    ()               => request<JiraProject[]>('/projects'),
    get:     (id: string)     => request<JiraProject>(`/projects/${id}`),
    create:  (body: Partial<JiraProject> & { key: string; name: string }) =>
      request<JiraProject>('/projects', { method: 'POST', body: JSON.stringify(body) }),
    update:  (id: string, body: Partial<JiraProject>) =>
      request<JiraProject>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete:  (id: string)     => request<void>(`/projects/${id}`, { method: 'DELETE' }),
    sprints: (id: string)     => request<Sprint[]>(`/projects/${id}/sprints`),
    issues:  (id: string)     => request<JiraIssue[]>(`/projects/${id}/issues`),
  },

  // ── Issues ──────────────────────────────────────────────────────────────────
  issues: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<JiraIssue[]>(`/issues${qs}`);
    },
    get:    (id: string)               => request<JiraIssue>(`/issues/${id}`),
    create: (body: IssueFormData)      => request<JiraIssue>('/issues', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<IssueFormData>) =>
      request<JiraIssue>(`/issues/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    updateStatus: (id: string, status: string) =>
      request<{ ok: boolean }>(`/issues/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    reorder: (items: ReorderItem[]) =>
      request<{ ok: boolean }>('/issues/reorder', { method: 'PATCH', body: JSON.stringify({ items }) }),
    delete:  (id: string)              => request<void>(`/issues/${id}`, { method: 'DELETE' }),
    comment: (id: string, body: { body: string }) =>
      request<{ id: string; authorId: string; body: string; createdAt: string }>(
        `/issues/${id}/comments`, { method: 'POST', body: JSON.stringify(body) }
      ),
  },

  // ── Sprints ─────────────────────────────────────────────────────────────────
  sprints: {
    list:   (projectId?: string) => {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      return request<Sprint[]>(`/sprints${qs}`);
    },
    get:    (id: string) => request<Sprint>(`/sprints/${id}`),
    create: (body: { projectId: string; name: string; goal?: string; startDate?: string; endDate?: string }) =>
      request<Sprint>('/sprints', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Sprint>) =>
      request<Sprint>(`/sprints/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/sprints/${id}`, { method: 'DELETE' }),
    start:  (id: string) => request<Sprint>(`/sprints/${id}/start`, { method: 'POST' }),
    close:  (id: string) => request<Sprint>(`/sprints/${id}/close`, { method: 'POST' }),
  },

  // ── Confluence ──────────────────────────────────────────────────────────────
  confluence: {
    spaces: () => request<ConfluenceSpace[]>('/confluence/spaces'),
    createSpace: (body: { key: string; name: string; description?: string; emoji?: string; color?: string }) =>
      request<ConfluenceSpace>('/confluence/spaces', { method: 'POST', body: JSON.stringify(body) }),
    updateSpace: (id: string, body: Partial<ConfluenceSpace>) =>
      request<ConfluenceSpace>(`/confluence/spaces/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteSpace: (id: string) => request<void>(`/confluence/spaces/${id}`, { method: 'DELETE' }),

    pages: (key: string) => request<ConfluencePage[]>(`/confluence/spaces/${key}/pages`),
    createPage: (key: string, body: { title: string; content?: string; tags?: string[]; emoji?: string; parentId?: string }) =>
      request<ConfluencePage>(`/confluence/spaces/${key}/pages`, { method: 'POST', body: JSON.stringify(body) }),
    getPage:    (id: string) => request<ConfluencePage>(`/confluence/pages/${id}`),
    updatePage: (id: string, body: Partial<ConfluencePage>) =>
      request<ConfluencePage>(`/confluence/pages/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deletePage: (id: string) => request<void>(`/confluence/pages/${id}`, { method: 'DELETE' }),
    likePage:   (id: string) => request<{ likes: number }>(`/confluence/pages/${id}/like`, { method: 'POST' }),
    search: (q: string) =>
      request<Array<ConfluencePage & { spaceName: string; spaceColor: string; spaceEmoji: string }>>(
        `/confluence/search?q=${encodeURIComponent(q)}`
      ),
  },

  // ── Utilisateurs ────────────────────────────────────────────────────────────
  users: {
    list: ()             => request<JiraUser[]>('/users'),
    get:  (id: string)   => request<JiraUser>(`/users/${id}`),
    update: (id: string, body: Partial<JiraUser>) =>
      request<JiraUser>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
  },

  // ── Agents AI ────────────────────────────────────────────────────────────────
  agents: {
    list: () => request<AIAgent[]>('/agents'),
    get:  (id: string) => request<AIAgent>(`/agents/${id}`),
    create: (body: Partial<AIAgent> & { name: string; slug: string; type: string }) =>
      request<AIAgent>('/agents', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<AIAgent>) =>
      request<AIAgent>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/agents/${id}`, { method: 'DELETE' }),
    queue:  (id: string, limit?: number) =>
      request<AITaskQueue[]>(`/agents/${id}/queue${limit ? `?limit=${limit}` : ''}`),
    stats:  (id: string) => request<Record<string, unknown>>(`/agents/${id}/stats`),

    // Actions sur les issues
    assignToIssue: (issueId: string, payload: AssignAgentPayload) =>
      request<{ message: string; task?: AITaskQueue }>(
        `/agents/issues/${issueId}/assign-agent`,
        { method: 'POST', body: JSON.stringify(payload) }
      ),
    startOnIssue: (issueId: string, instructions?: string) =>
      request<{ message: string; task: AITaskQueue }>(
        `/agents/issues/${issueId}/start-agent`,
        { method: 'POST', body: JSON.stringify({ instructions }) }
      ),
    pauseOnIssue:  (issueId: string) =>
      request<{ message: string }>(`/agents/issues/${issueId}/pause-agent`, { method: 'POST' }),
    retryOnIssue:  (issueId: string) =>
      request<{ message: string }>(`/agents/issues/${issueId}/retry-agent`, { method: 'POST' }),
    cancelOnIssue: (issueId: string) =>
      request<{ message: string }>(`/agents/issues/${issueId}/cancel-agent`, { method: 'DELETE' }),

    // Données d'une issue
    logs:           (issueId: string, limit?: number) =>
      request<AgentLog[]>(`/agents/issues/${issueId}/agent-logs${limit ? `?limit=${limit}` : ''}`),
    artifacts:      (issueId: string) =>
      request<AgentArtifact[]>(`/agents/issues/${issueId}/artifacts`),
    confluenceLink: (issueId: string) =>
      request<Record<string, unknown> | null>(`/agents/issues/${issueId}/confluence-link`),

    // Queue globale
    globalQueue: (status?: string) =>
      request<AITaskQueue[]>(`/agents/queue${status ? `?status=${status}` : ''}`),
    globalStats: () => request<Record<string, unknown>>('/agents/queue/stats'),
  },

  // ── Admin / Configuration ────────────────────────────────────────────────────
  admin: {
    getLLMConfig: () => request<{
      provider: string;
      model: string;
      availableProviders: string[];
      defaultModels: Record<string, string>;
      suggestedModels: Record<string, string[]>;
      providers: Array<{
        id: string;
        active: boolean;
        configured: boolean;
        envStatus: Record<string, boolean>;
        defaultModel: string;
        suggestedModels: string[];
      }>;
      hasOpenAIKey: boolean;
      hasAnthropicKey: boolean;
      hasGeminiKey: boolean;
      hasMistralKey: boolean;
      hasCohereKey: boolean;
      hasGroqKey: boolean;
      hasAzureOpenAIKey: boolean;
      hasHuggingFaceKey: boolean;
    }>('/admin/llm-config'),
    updateLLMConfig: (body: { provider: string; model: string }) =>
      request<{ success: boolean; provider: string; model: string; warnings?: string[] }>(
        '/admin/llm-config', { method: 'PUT', body: JSON.stringify(body) }
      ),
    testLLMConfig: () =>
      request<{
        success: boolean;
        provider: string;
        model: string;
        durationMs: number;
        tokensUsed?: number;
        response?: string;
        error?: string;
      }>('/admin/llm-config/test'),
    getLLMKeys: () =>
      request<Record<string, { set: boolean; masked: string }>>('/admin/llm-config/keys'),
    saveLLMKeys: (keys: Record<string, string>) =>
      request<{ success: boolean; updated: string[] }>(
        '/admin/llm-config/keys', { method: 'PUT', body: JSON.stringify({ keys }) }
      ),
  },
};
