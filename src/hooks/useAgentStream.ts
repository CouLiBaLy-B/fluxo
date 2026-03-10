// ═══════════════════════════════════════════════════════════════════════════════
// Hook useAgentStream — Connexion WebSocket pour les events agents en temps réel
// Reconnexion automatique, buffer des messages, état réactif
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  AgentLog,
  AgentArtifact,
  TaskQueueStatus,
  AgentWSEvent,
} from '../types';

// URL WebSocket : même host que l'API, path /ws
function getWsUrl(issueId?: string): string {
  const apiUrl = import.meta.env['VITE_API_URL'] as string | undefined ?? 'http://localhost:4000';
  const wsBase = apiUrl.replace(/^http/, 'ws');
  return issueId ? `${wsBase}/ws?issueId=${encodeURIComponent(issueId)}` : `${wsBase}/ws`;
}

// ── Types retournés par le hook ───────────────────────────────────────────────

export interface AgentStreamState {
  logs: AgentLog[];
  progress: number;
  status: TaskQueueStatus | null;
  artifacts: AgentArtifact[];
  summary: string | null;
  error: string | null;
  isConnected: boolean;
  agentName: string | null;
  confluencePageId: string | null;
}

export function useAgentStream(issueId?: string): AgentStreamState & {
  clearLogs: () => void;
  reconnect: () => void;
} {
  const [state, setState] = useState<AgentStreamState>({
    logs: [],
    progress: 0,
    status: null,
    artifacts: [],
    summary: null,
    error: null,
    isConnected: false,
    agentName: null,
    confluencePageId: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 2000;

  const connect = useCallback(() => {
    if (!issueId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = getWsUrl(issueId);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        reconnectAttemptsRef.current = 0;
        setState(prev => ({ ...prev, isConnected: true, error: null }));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data as string) as AgentWSEvent;
          handleEvent(data);
        } catch {
          // Message non-JSON ignoré
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setState(prev => ({ ...prev, isConnected: false }));

        // Reconnexion automatique avec backoff
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) connect();
          }, delay);
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setState(prev => ({ ...prev, isConnected: false }));
      };
    } catch {
      setState(prev => ({ ...prev, isConnected: false }));
    }
  }, [issueId]);

  // ── Traitement des événements WebSocket ───────────────────────────────────

  const handleEvent = useCallback((event: AgentWSEvent) => {
    switch (event.type) {
      case 'agent:started':
        setState(prev => ({
          ...prev,
          status: 'running',
          agentName: event.agentName,
          progress: 0,
          error: null,
        }));
        break;

      case 'agent:progress':
        setState(prev => ({
          ...prev,
          progress: event.progress,
          status: 'running',
        }));
        break;

      case 'agent:log':
        setState(prev => ({
          ...prev,
          logs: [...prev.logs, event.log].slice(-200), // garder les 200 derniers
        }));
        break;

      case 'agent:artifact':
        setState(prev => ({
          ...prev,
          artifacts: [...prev.artifacts.filter(a => a.id !== event.artifact.id), event.artifact],
        }));
        break;

      case 'agent:completed':
        setState(prev => ({
          ...prev,
          status: 'completed',
          progress: 100,
          summary: event.summary,
          confluencePageId: event.confluencePageId ?? null,
        }));
        break;

      case 'agent:failed':
        setState(prev => ({
          ...prev,
          status: 'failed',
          error: event.error,
        }));
        break;

      case 'issue:status_changed':
        // Juste pour info, pas de changement d'état local nécessaire
        break;

      case 'buffer':
        // Replay les events bufferisés (reconnexion)
        event.events.forEach(e => handleEvent(e));
        break;
    }
  }, []);

  // ── Cycle de vie ─────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const clearLogs = useCallback(() => {
    setState(prev => ({ ...prev, logs: [] }));
  }, []);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    connect();
  }, [connect]);

  return { ...state, clearLogs, reconnect };
}
