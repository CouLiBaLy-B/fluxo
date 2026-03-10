// ── AgentDashboard — Vue globale de tous les agents avec métriques ─────────────

import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { AgentCard } from './AgentCard';
import type { AITaskQueue } from '../../types';

interface QueueStats {
  totalPending: number;
  totalRunning: number;
  totalCompleted: number;
  totalFailed: number;
  totalCancelled: number;
}

export function AgentDashboard() {
  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.agents.list(),
    refetchInterval: 5000,
  });

  const { data: rawStats } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: () => api.agents.globalStats(),
    refetchInterval: 5000,
  });

  const { data: queue } = useQuery({
    queryKey: ['global-queue'],
    queryFn: () => api.agents.globalQueue(),
    refetchInterval: 3000,
  });

  const stats = rawStats as QueueStats | undefined;
  const pendingQueue = queue?.filter((t: AITaskQueue) => t.status === 'pending') ?? [];
  const runningTasks = agents?.reduce((sum, a) => sum + (a.currentTasks ?? 0), 0) ?? 0;
  const completedToday = agents?.reduce((sum, a) => sum + (a.completedToday ?? 0), 0) ?? 0;
  const totalTokens = agents?.reduce((sum, a) => sum + (a.totalTokensUsed ?? 0), 0) ?? 0;
  const avgDuration = agents && agents.length > 0
    ? agents.reduce((sum, a) => sum + (a.avgDurationMs ?? 0), 0) / agents.length
    : 0;

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
  }

  function formatDuration(ms: number): string {
    if (!ms) return '—';
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  const PRIORITY_COLORS: Record<string, string> = {
    '1': 'text-red-600', '2': 'text-red-500',
    '3': 'text-orange-500', '5': 'text-yellow-500',
    '7': 'text-blue-500', '9': 'text-gray-400',
  };

  if (agentsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Titre */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Agents AI — Tableau de bord</h1>
        <p className="text-sm text-gray-500 mt-1">Supervision en temps réel des agents d'orchestration</p>
      </div>

      {/* Métriques globales */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Tâches actives',    value: runningTasks,                 color: 'text-blue-600' },
          { label: 'Terminées auj.',    value: completedToday,               color: 'text-green-600' },
          { label: 'Tokens utilisés',   value: formatTokens(totalTokens),    color: 'text-purple-600' },
          { label: 'Durée moyenne',     value: formatDuration(avgDuration),  color: 'text-orange-600' },
        ].map(metric => (
          <div key={metric.label} className="bg-white rounded-xl border p-4 text-center">
            <p className={`text-2xl font-bold ${metric.color}`}>{metric.value}</p>
            <p className="text-xs text-gray-500 mt-1">{metric.label}</p>
          </div>
        ))}
      </div>

      {/* Agents */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Agents disponibles</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents?.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>

      {/* File d'attente */}
      {pendingQueue.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-3">
            File d'attente
            <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
              {pendingQueue.length}
            </span>
          </h2>
          <div className="bg-white rounded-xl border overflow-hidden">
            {pendingQueue.map((task: AITaskQueue & { agentName?: string; issueKey?: string; issueTitle?: string }, i: number) => (
              <div
                key={task.id}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t' : ''}`}
              >
                <span className={`text-sm font-bold ${PRIORITY_COLORS[String(task.priority)] ?? 'text-gray-500'}`}>
                  P{task.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {task.issueKey ? `${task.issueKey} · ` : ''}{task.issueTitle ?? task.issueId}
                  </p>
                  <p className="text-xs text-gray-400">
                    {task.agentName ?? task.agentId} · En attente
                  </p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(task.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats erreurs */}
      {(stats?.totalFailed ?? 0) > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-medium text-red-700">
            {stats?.totalFailed} tâche(s) en échec · {stats?.totalCancelled ?? 0} annulée(s)
          </p>
        </div>
      )}
    </div>
  );
}
