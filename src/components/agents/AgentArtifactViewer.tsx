// ── AgentArtifactViewer — Visualiseur des artefacts produits par l'agent ───────

import { useState } from 'react';
import type { AgentArtifact, ArtifactType } from '../../types';

interface Props {
  artifacts: AgentArtifact[];
}

const TYPE_ICONS: Record<ArtifactType, string> = {
  code:    '📄',
  test:    '🧪',
  doc:     '📝',
  report:  '📊',
  diagram: '📐',
};

function formatSize(content: string): string {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function AgentArtifactViewer({ artifacts }: Props) {
  const [selected, setSelected] = useState<AgentArtifact | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyToClipboard(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback silencieux
    }
  }

  if (artifacts.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">Aucun artefact produit pour le moment.</p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Liste des artefacts */}
      <div className="space-y-1.5">
        {artifacts.map(artifact => (
          <div
            key={artifact.id}
            className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200
                       hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span>{TYPE_ICONS[artifact.type] ?? '📄'}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{artifact.filename}</p>
                <p className="text-xs text-gray-400">
                  {artifact.type}{artifact.language ? ` · ${artifact.language}` : ''} · {formatSize(artifact.content)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <button
                onClick={() => setSelected(selected?.id === artifact.id ? null : artifact)}
                className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 rounded transition-colors"
              >
                {selected?.id === artifact.id ? 'Fermer' : 'Voir'}
              </button>
              <button
                onClick={() => void copyToClipboard(artifact.content)}
                className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 rounded transition-colors"
              >
                {copied ? '✓' : 'Copier'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Visionneuse de contenu */}
      {selected && (
        <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between bg-gray-100 px-3 py-2 border-b">
            <span className="text-sm font-medium text-gray-700">{selected.filename}</span>
            <button
              onClick={() => setSelected(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          </div>
          <pre className="p-3 text-xs bg-gray-900 text-gray-100 overflow-auto max-h-80 leading-relaxed">
            <code>{selected.content}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
