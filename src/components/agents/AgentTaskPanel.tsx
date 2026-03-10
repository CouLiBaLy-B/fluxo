// ── AgentTaskPanel — Panel latéral tâche en cours avec logs live ──────────────

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAgentStream } from '../../hooks/useAgentStream';
import { AgentProgressBar } from './AgentProgressBar';
import { AgentLogViewer } from './AgentLogViewer';
import { AgentArtifactViewer } from './AgentArtifactViewer';
import type { AIAgent, AITaskQueue } from '../../types';

interface Props {
  issueId: string;
  issueKey: string;
  issueTitle: string;
  agent: AIAgent;
  task: AITaskQueue;
  onClose: () => void;
}

function formatDuration(startedAt?: string): string {
  if (!startedAt) return '—';
  const ms = Date.now() - new Date(startedAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function AgentTaskPanel({ issueId, issueKey, issueTitle, agent, task, onClose }: Props) {
  const queryClient = useQueryClient();
  const stream = useAgentStream(issueId);

  // Utiliser la progression du stream temps réel ou celle de la tâche en base
  const progress = stream.progress > 0 ? stream.progress : task.progress;
  const status = stream.status ?? task.status;
  const totalTokens = stream.logs.reduce((sum, l) => sum + (l.tokensUsed ?? 0), 0);

  const pauseMutation = useMutation({
    mutationFn: () => api.agents.pauseOnIssue(issueId),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['issues'] }); },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.agents.cancelOnIssue(issueId),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['issues'] }); onClose(); },
  });

  const isRunning = status === 'running' || status === 'pending';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
        <div className="flex items-center gap-2">
          <span className="text-xl">{agent.avatarEmoji}</span>
          <div>
            <p className="text-sm font-semibold text-gray-900">{agent.name}</p>
            <p className="text-xs text-gray-500">
              {isRunning ? 'En cours' : isCompleted ? 'Terminé' : isFailed ? 'Échec' : status}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">
          ×
        </button>
      </div>

      {/* Progression */}
      <div className="px-4 pt-3">
        <AgentProgressBar progress={progress} status={status} showLabel height="md" />
      </div>

      {/* Info issue */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100">
        <p className="text-xs text-gray-500">
          <span className="font-mono font-medium text-blue-600">{issueKey}</span>
          {' — '}{issueTitle}
        </p>
        <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
          <span>⏱ {formatDuration(task.startedAt)}</span>
          <span>🪙 {formatTokens(totalTokens)} tokens</span>
          {task.retryCount > 0 && <span className="text-yellow-600">Tentative {task.retryCount + 1}</span>}
        </div>
      </div>

      {/* Logs */}
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">Logs en direct</p>
        <AgentLogViewer logs={stream.logs} maxHeight="200px" autoScroll />
      </div>

      {/* Artefacts */}
      {stream.artifacts.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">Artefacts produits</p>
          <AgentArtifactViewer artifacts={stream.artifacts} />
        </div>
      )}

      {/* Résumé (si terminé) */}
      {stream.summary && (
        <div className="px-4 py-3 border-b border-gray-100 bg-green-50">
          <p className="text-xs font-medium text-green-700 mb-1">Résumé</p>
          <p className="text-sm text-green-800">{stream.summary}</p>
        </div>
      )}

      {/* Erreur */}
      {stream.error && (
        <div className="px-4 py-3 border-b border-gray-100 bg-red-50">
          <p className="text-xs font-medium text-red-700 mb-1">Erreur</p>
          <p className="text-sm text-red-800">{stream.error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3">
        {isRunning && (
          <button
            onClick={() => pauseMutation.mutate()}
            disabled={pauseMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600
                       border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            ⏸ Pause
          </button>
        )}
        {isRunning && (
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600
                       border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            ⏹ Annuler
          </button>
        )}
        {stream.confluencePageId && (
          <a
            href={`#confluence-${stream.confluencePageId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600
                       border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors ml-auto"
          >
            📋 Voir sur Confluence
          </a>
        )}
      </div>
    </div>
  );
}
