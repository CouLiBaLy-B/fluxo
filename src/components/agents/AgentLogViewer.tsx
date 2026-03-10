// ── AgentLogViewer — Affichage terminal des logs en temps réel ────────────────

import { useEffect, useRef } from 'react';
import type { AgentLog, LogLevel } from '../../types';

interface Props {
  logs: AgentLog[];
  maxHeight?: string;
  autoScroll?: boolean;
}

const LEVEL_STYLES: Record<LogLevel, { dot: string; text: string; prefix: string }> = {
  info:    { dot: 'bg-blue-400',   text: 'text-gray-200',  prefix: '  ' },
  success: { dot: 'bg-green-400',  text: 'text-green-300', prefix: '✓ ' },
  warning: { dot: 'bg-yellow-400', text: 'text-yellow-300',prefix: '⚠ ' },
  error:   { dot: 'bg-red-400',    text: 'text-red-300',   prefix: '✗ ' },
};

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function AgentLogViewer({ logs, maxHeight = '240px', autoScroll = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  if (logs.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 text-center">
        <p className="text-gray-500 text-sm">En attente des logs...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="bg-gray-900 rounded-lg p-3 overflow-y-auto font-mono text-xs space-y-1"
      style={{ maxHeight }}
    >
      {logs.map((log, i) => {
        const style = LEVEL_STYLES[log.level] ?? LEVEL_STYLES.info;
        return (
          <div key={log.id ?? i} className="flex items-start gap-2 group">
            {/* Heure */}
            <span className="text-gray-500 shrink-0 mt-0.5">{formatTime(log.createdAt)}</span>
            {/* Dot niveau */}
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${style.dot}`} />
            {/* Contenu */}
            <span className={style.text}>
              <span className="text-gray-400">{log.step && `[${log.step}] `}</span>
              {style.prefix}{log.message}
              {log.tokensUsed > 0 && (
                <span className="ml-2 text-gray-600">({log.tokensUsed} tokens)</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
