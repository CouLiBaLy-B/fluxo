// ═══════════════════════════════════════════════════════════════════════════════
// Service LLM — Abstraction multi-provider (OpenAI / Anthropic / Ollama / Mock)
// ═══════════════════════════════════════════════════════════════════════════════

import type { LLMConfig, LLMMessage, LLMResponse, LLMProvider } from '../types/agents.types';
import logger from '../logger';
import { pool } from '../db/pool';

// ── Réponses mock pour le développement sans clé API ─────────────────────────

const MOCK_RESPONSES: Record<string, string> = {
  developer: `# Code généré (mode mock)

\`\`\`typescript
// Composant généré automatiquement par Agent Developer
import React from 'react';

interface Props {
  title: string;
  description?: string;
}

export function GeneratedComponent({ title, description }: Props) {
  return (
    <div className="p-4 rounded-lg border border-gray-200">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="mt-2 text-gray-600">{description}</p>}
    </div>
  );
}
\`\`\`

**Architecture** : Composant React fonctionnel avec TypeScript strict.
**Points clés** : Props typées, style Tailwind, accessibilité basique.`,

  qa: `# Tests générés (mode mock)

\`\`\`typescript
import { render, screen } from '@testing-library/react';
import { GeneratedComponent } from './GeneratedComponent';

describe('GeneratedComponent', () => {
  it('affiche le titre correctement', () => {
    render(<GeneratedComponent title="Test titre" />);
    expect(screen.getByText('Test titre')).toBeInTheDocument();
  });

  it('affiche la description quand fournie', () => {
    render(<GeneratedComponent title="Titre" description="Ma description" />);
    expect(screen.getByText('Ma description')).toBeInTheDocument();
  });

  it('n\\'affiche pas la description quand absente', () => {
    render(<GeneratedComponent title="Titre" />);
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });
});
\`\`\`

**Couverture** : 3 tests unitaires, 100% des branches couvertes.`,

  writer: `# Documentation générée (mode mock)

## Vue d'ensemble

Ce composant a été développé pour répondre au besoin décrit dans l'issue.

## Installation

Aucune dépendance supplémentaire requise.

## Utilisation

\`\`\`tsx
import { GeneratedComponent } from './GeneratedComponent';

// Usage basique
<GeneratedComponent title="Mon titre" />

// Avec description
<GeneratedComponent title="Mon titre" description="Ma description" />
\`\`\`

## Props

| Prop | Type | Requis | Description |
|------|------|--------|-------------|
| title | string | Oui | Titre principal |
| description | string | Non | Description optionnelle |

## Décisions techniques

- TypeScript strict pour la sécurité des types
- Tailwind CSS pour la cohérence visuelle`,

  researcher: `# Analyse (mode mock)

## Résumé de la recherche

Après analyse du problème décrit, voici les principales conclusions :

### Solutions identifiées

1. **Approche A** — Solution légère, simple à implémenter
   - Avantages : rapide, pas de dépendances
   - Inconvénients : moins extensible

2. **Approche B** — Solution robuste, orientée maintenabilité
   - Avantages : extensible, testable
   - Inconvénients : plus complexe

### Recommandation

L'**Approche B** est recommandée pour les raisons suivantes :
- Meilleure maintenabilité long terme
- Compatible avec l'architecture existante
- Standards de l'industrie bien documentés

### Références

- Documentation officielle React 19
- Best practices TypeScript 5.x`,

  architect: `# Architecture proposée (mode mock)

## Diagramme conceptuel

\`\`\`
Client Browser
  └── React SPA
        ├── Components Layer
        │     ├── Pages (routing)
        │     ├── Features (business logic)
        │     └── UI (presentational)
        ├── State Management
        │     ├── React Query (server state)
        │     └── Context API (UI state)
        └── API Layer
              └── Axios client

Backend API (Express)
  ├── Routes Layer
  ├── Services Layer
  └── Database Layer (PostgreSQL)
\`\`\`

## Décisions clés

1. **Séparation des responsabilités** : chaque couche a un rôle unique
2. **Type safety** : TypeScript strict end-to-end
3. **Performance** : React Query pour le cache et la synchronisation

## Prochaines étapes

1. Valider l'architecture avec l'équipe
2. Créer les tickets d'implémentation
3. Définir les interfaces entre les couches`,

  default: `# Tâche complétée (mode mock)

L'agent a analysé la demande et produit un résultat simulé.

Ce mode mock permet de développer et tester l'interface sans clé API.
Pour activer le LLM réel, configurez \`LLM_PROVIDER\` dans votre \`.env\`.`,
};

// ── Classe principale du service LLM ─────────────────────────────────────────

export class LLMService {
  private config: LLMConfig;

  constructor(config?: Partial<LLMConfig>) {
    const provider = (process.env['LLM_PROVIDER'] as LLMProvider) || 'mock';
    this.config = {
      provider,
      model: process.env['OPENAI_MODEL'] || 'gpt-4o',
      temperature: config?.temperature ?? 0.3,
      maxTokens: config?.maxTokens ?? 4096,
      streaming: config?.streaming ?? false,
      ...config,
    };
  }

  /** Charge la config depuis la DB (prioritaire sur env vars). Appelé au démarrage. */
  async loadFromDB(): Promise<void> {
    try {
      const result = await pool.query<{ key: string; value: string }>(
        `SELECT key, value FROM app_settings WHERE key IN ('llm_provider', 'llm_model')`
      );
      const settings = Object.fromEntries(result.rows.map((r: { key: string; value: string }) => [r.key, r.value]));
      if (settings['llm_provider']) {
        this.config.provider = settings['llm_provider'] as LLMProvider;
      }
      if (settings['llm_model']) {
        this.config.model = settings['llm_model'];
      }
      logger.info('Config LLM chargée depuis DB', { provider: this.config.provider, model: this.config.model });
    } catch (err) {
      logger.warn('Impossible de charger la config LLM depuis DB, utilisation des env vars', {
        error: (err as Error).message,
      });
    }
  }

  /** Met à jour le provider et le modèle à chaud (sans redémarrage). */
  setProvider(provider: LLMProvider, model: string): void {
    this.config = { ...this.config, provider, model };
    logger.info('Config LLM mise à jour', { provider, model });
  }

  // ── Point d'entrée principal ───────────────────────────────────────────────

  async complete(messages: LLMMessage[], agentType?: string): Promise<LLMResponse> {

    try {
      switch (this.config.provider) {
        case 'openai':
          return await this.completeOpenAI(messages);
        case 'anthropic':
          return await this.completeAnthropic(messages);
        case 'ollama':
          return await this.completeOllama(messages);
        case 'mock':
        default:
          return await this.completeMock(agentType);
      }
    } catch (err) {
      const error = err as Error;
      // Gestion des erreurs communes : timeout, rate limit, quota
      if (error.message?.includes('rate_limit') || error.message?.includes('429')) {
        logger.warn('LLM rate limit atteint, bascule vers mock', { provider: this.config.provider });
        return await this.completeMock(agentType, 'Rate limit atteint — réponse simulée');
      }
      if (error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
        logger.warn('LLM timeout, bascule vers mock', { provider: this.config.provider });
        return await this.completeMock(agentType, 'Timeout LLM — réponse simulée');
      }
      throw error;
    }
  }

  // ── Provider OpenAI ───────────────────────────────────────────────────────

  private async completeOpenAI(messages: LLMMessage[]): Promise<LLMResponse> {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY non configurée');
    }

    // Import dynamique pour éviter l'erreur si le package n'est pas installé
    const OpenAI = await import('openai').then(m => m.default).catch(() => null);
    if (!OpenAI) {
      throw new Error('Package openai non installé. Exécutez : npm install openai');
    }

    const startedAt = Date.now();
    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: this.config.model,
      messages: messages as { role: 'system' | 'user' | 'assistant'; content: string }[],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });

    const content = response.choices[0]?.message?.content ?? '';
    const tokensUsed = response.usage?.total_tokens ?? 0;

    return {
      content,
      tokensUsed,
      model: response.model,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Provider Anthropic ────────────────────────────────────────────────────

  private async completeAnthropic(messages: LLMMessage[]): Promise<LLMResponse> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY non configurée');
    }

    const Anthropic = await import('@anthropic-ai/sdk').then(m => m.default).catch(() => null);
    if (!Anthropic) {
      throw new Error('Package @anthropic-ai/sdk non installé. Exécutez : npm install @anthropic-ai/sdk');
    }

    const startedAt = Date.now();
    const client = new Anthropic({ apiKey });

    // Séparer le message système des messages utilisateur/assistant
    const systemMessage = messages.find(m => m.role === 'system')?.content ?? '';
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const response = await client.messages.create({
      model: process.env['ANTHROPIC_MODEL'] || 'claude-sonnet-4-6',
      max_tokens: this.config.maxTokens,
      system: systemMessage,
      messages: conversationMessages as { role: 'user' | 'assistant'; content: string }[],
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);

    return {
      content,
      tokensUsed,
      model: response.model,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Provider Ollama (local, zéro coût) ────────────────────────────────────

  private async completeOllama(messages: LLMMessage[]): Promise<LLMResponse> {
    const baseUrl = process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434';
    const model = process.env['OLLAMA_MODEL'] || 'qwen3.5:0.8b-q8_0.5:0.8b-q8_0ma3';
    const startedAt = Date.now();

    // Utilise fetch natif (Node 18+)
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(120_000), // timeout 2 minutes pour Ollama
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
      model?: string;
    };

    return {
      content: data.message?.content ?? '',
      tokensUsed: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      model: data.model ?? model,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Provider Mock (développement sans clé API) ────────────────────────────

  private async completeMock(agentType?: string, prefix?: string): Promise<LLMResponse> {
    // Simule un délai réseau réaliste (1-3 secondes)
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    const content = MOCK_RESPONSES[agentType ?? 'default'] ?? MOCK_RESPONSES['default'] ?? '';
    const finalContent = prefix ? `> ${prefix}\n\n${content}` : content;

    return {
      content: finalContent,
      tokensUsed: Math.floor(Math.random() * 500) + 200,
      model: 'mock-v1',
      durationMs: 1500,
    };
  }

  // ── Utilitaire : streaming simulé par chunks ──────────────────────────────

  async *stream(
    messages: LLMMessage[],
    agentType?: string,
    onChunk?: (chunk: string) => void
  ): AsyncGenerator<string> {
    // En mode mock ou si streaming non supporté, on découpe la réponse en chunks
    const result = await this.complete(messages, agentType);
    const words = result.content.split(' ');

    for (const word of words) {
      const chunk = word + ' ';
      onChunk?.(chunk);
      yield chunk;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  // ── Getter de la config active ─────────────────────────────────────────────

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  getProvider(): LLMProvider {
    return this.config.provider;
  }

  isMockMode(): boolean {
    return this.config.provider === 'mock';
  }
}

// Singleton partagé dans l'application
export const llmService = new LLMService();
