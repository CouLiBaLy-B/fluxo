// ═══════════════════════════════════════════════════════════════════════════════
// Service LLM — Abstraction multi-provider
// Providers : OpenAI / Anthropic / Ollama / Gemini / Mistral /
//             Cohere / Groq / Azure OpenAI / HuggingFace / Mock
// ═══════════════════════════════════════════════════════════════════════════════

import type { LLMConfig, LLMMessage, LLMResponse, LLMProvider } from '../types/agents.types';
import logger from '../logger';
import { pool } from '../db/pool';

// ── Types locaux ──────────────────────────────────────────────────────────────

type HFTask = 'text-generation' | 'conversational';

// ── Constantes ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

/** Modèles par défaut pour chaque provider */
const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai:         'gpt-4o',
  anthropic:      'claude-sonnet-4-6',
  ollama:         'llama3.2',
  gemini:         'gemini-2.0-flash',
  mistral:        'mistral-large-latest',
  cohere:         'command-r-plus',
  groq:           'llama-3.3-70b-versatile',
  'azure-openai': 'gpt-4o',
  huggingface:    'mistralai/Mistral-7B-Instruct-v0.3',
  mock:           'mock-v1',
};

/** Variables d'environnement par provider */
const PROVIDER_ENV: Record<LLMProvider, { apiKey?: string; baseUrl?: string; model?: string }> = {
  openai:         { apiKey: 'OPENAI_API_KEY',          model: 'OPENAI_MODEL' },
  anthropic:      { apiKey: 'ANTHROPIC_API_KEY',       model: 'ANTHROPIC_MODEL' },
  ollama:         { baseUrl: 'OLLAMA_BASE_URL',         model: 'OLLAMA_MODEL' },
  gemini:         { apiKey: 'GEMINI_API_KEY',           model: 'GEMINI_MODEL' },
  mistral:        { apiKey: 'MISTRAL_API_KEY',          model: 'MISTRAL_MODEL' },
  cohere:         { apiKey: 'COHERE_API_KEY',           model: 'COHERE_MODEL' },
  groq:           { apiKey: 'GROQ_API_KEY',             model: 'GROQ_MODEL' },
  'azure-openai': {
    apiKey:  'AZURE_OPENAI_API_KEY',
    baseUrl: 'AZURE_OPENAI_ENDPOINT',
    model:   'AZURE_OPENAI_DEPLOYMENT',
  },
  huggingface:    {
    apiKey:  'HF_API_KEY',
    baseUrl: 'HF_ENDPOINT_URL',
    model:   'HF_MODEL',
  },
  mock: {},
};

// ── Réponses mock ─────────────────────────────────────────────────────────────

const MOCK_RESPONSES: Record<string, string> = {
  developer: `# Code généré (mode mock)

\`\`\`typescript
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

## Utilisation

\`\`\`tsx
import { GeneratedComponent } from './GeneratedComponent';

<GeneratedComponent title="Mon titre" />
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

## Solutions identifiées

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
- Standards de l'industrie bien documentés`,

  architect: `# Architecture proposée (mode mock)

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
3. **Performance** : React Query pour le cache et la synchronisation`,

  default: `# Tâche complétée (mode mock)

L'agent a analysé la demande et produit un résultat simulé.

Ce mode mock permet de développer et tester l'interface sans clé API.
Pour activer le LLM réel, configurez \`LLM_PROVIDER\` dans votre \`.env\`.`,
};

// ── Helpers internes ──────────────────────────────────────────────────────────

/**
 * Lecture sécurisée d'une variable d'environnement.
 * Lance une erreur claire si absente.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}\n` +
      `Ajoutez-la dans votre .env ou configurez-la dans les paramètres de l'application.`
    );
  }
  return value;
}

/** Construit les headers JSON + Authorization Bearer pour les appels REST. */
function jsonHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
}

/**
 * Fetch avec timeout et gestion d'erreur HTTP unifiée.
 * Lève une erreur descriptive en cas de statut non-2xx.
 */
async function fetchJSON<T>(
  url:       string,
  init: {
    method:  string;
    headers: Record<string, string>;
    body?:   string;
  },
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `HTTP ${response.status} ${response.statusText} — ${url}\n${body}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Sépare le message system des messages de conversation.
 * Utilisé par Anthropic, Mistral, Cohere, HuggingFace.
 */
function splitSystemMessages(messages: LLMMessage[]): {
  system:       string;
  conversation: LLMMessage[];
} {
  return {
    system:       messages.find(m => m.role === 'system')?.content ?? '',
    conversation: messages.filter(m => m.role !== 'system'),
  };
}

// ── Classe principale ─────────────────────────────────────────────────────────

export class LLMService {
  private config: LLMConfig;

  constructor(config?: Partial<LLMConfig>) {
    const provider = (process.env['LLM_PROVIDER'] as LLMProvider) ?? 'mock';

    this.config = {
      provider,
      model:       process.env['OPENAI_MODEL'] ?? DEFAULT_MODELS[provider],
      temperature: config?.temperature ?? 0.3,
      maxTokens:   config?.maxTokens   ?? 4096,
      streaming:   config?.streaming   ?? false,
      ...config,
    };
  }

  // ── Persistance de la config ───────────────────────────────────────────────

  /**
   * Charge la config depuis la DB (prioritaire sur les env vars).
   * À appeler au démarrage de l'application.
   */
  async loadFromDB(): Promise<void> {
    try {
      const result = await pool.query<{ key: string; value: string }>(
        `SELECT key, value FROM app_settings
         WHERE key IN ('llm_provider', 'llm_model')`
      );

      const settings = Object.fromEntries(
        result.rows.map((r: { key: string; value: string }) => [r.key, r.value])
      );

      if (settings['llm_provider']) {
        this.config.provider = settings['llm_provider'] as LLMProvider;
      }
      if (settings['llm_model']) {
        this.config.model = settings['llm_model'];
      }

      logger.info('Config LLM chargée depuis DB', {
        provider: this.config.provider,
        model:    this.config.model,
      });
    } catch (err) {
      logger.warn(
        'Impossible de charger la config LLM depuis DB, utilisation des env vars',
        { error: (err as Error).message }
      );
    }
  }

  /**
   * Met à jour le provider et le modèle à chaud (sans redémarrage).
   * Si model est omis, utilise le modèle par défaut du provider.
   */
  setProvider(provider: LLMProvider, model?: string): void {
    this.config = {
      ...this.config,
      provider,
      model: model ?? DEFAULT_MODELS[provider],
    };
    logger.info('Config LLM mise à jour', { provider, model: this.config.model });
  }

  // ── Point d'entrée principal ───────────────────────────────────────────────

  async complete(messages: LLMMessage[], agentType?: string): Promise<LLMResponse> {
    const startedAt = Date.now();

    logger.debug('LLM complete()', {
      provider: this.config.provider,
      model:    this.config.model,
      messages: messages.length,
    });

    try {
      const response = await this.dispatch(messages, agentType);

      logger.info('LLM réponse reçue', {
        provider:   this.config.provider,
        tokensUsed: response.tokensUsed,
        durationMs: Date.now() - startedAt,
      });

      return response;

    } catch (err) {
      const error = err as Error;

      // ── Gestion des erreurs transitoires avec fallback mock ──────────────
      if (this.isRateLimitError(error)) {
        logger.warn('LLM rate limit — bascule vers mock', {
          provider: this.config.provider,
        });
        return this.completeMock(agentType, '⚠️ Rate limit atteint — réponse simulée');
      }

      if (this.isTimeoutError(error)) {
        logger.warn('LLM timeout — bascule vers mock', {
          provider: this.config.provider,
        });
        return this.completeMock(agentType, '⚠️ Timeout LLM — réponse simulée');
      }

      logger.error('LLM erreur critique', {
        provider: this.config.provider,
        error:    error.message,
      });
      throw error;
    }
  }

  // ── Dispatch vers le bon provider ─────────────────────────────────────────

  private async dispatch(
    messages:   LLMMessage[],
    agentType?: string
  ): Promise<LLMResponse> {
    switch (this.config.provider) {
      case 'openai':       return this.completeOpenAI(messages);
      case 'anthropic':    return this.completeAnthropic(messages);
      case 'ollama':       return this.completeOllama(messages);
      case 'gemini':       return this.completeGemini(messages);
      case 'mistral':      return this.completeMistral(messages);
      case 'cohere':       return this.completeCohere(messages);
      case 'groq':         return this.completeGroq(messages);
      case 'azure-openai': return this.completeAzureOpenAI(messages);
      case 'huggingface':  return this.completeHuggingFace(messages);
      case 'mock':
      default:             return this.completeMock(agentType);
    }
  }

  // ── Provider : OpenAI ─────────────────────────────────────────────────────

  private async completeOpenAI(messages: LLMMessage[]): Promise<LLMResponse> {
    const apiKey = requireEnv('OPENAI_API_KEY');

    const OpenAI = await import('openai')
      .then(m => m.default)
      .catch(() => {
        throw new Error('Package openai non installé : npm install openai');
      });

    const startedAt = Date.now();
    const client    = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model:       this.config.model,
      messages:    messages as { role: 'system' | 'user' | 'assistant'; content: string }[],
      temperature: this.config.temperature,
      max_tokens:  this.config.maxTokens,
    });

    return {
      content:    response.choices[0]?.message?.content ?? '',
      tokensUsed: response.usage?.total_tokens ?? 0,
      model:      response.model,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Provider : Anthropic ──────────────────────────────────────────────────

  private async completeAnthropic(messages: LLMMessage[]): Promise<LLMResponse> {
    const apiKey = requireEnv('ANTHROPIC_API_KEY');

    const Anthropic = await import('@anthropic-ai/sdk')
      .then(m => m.default)
      .catch(() => {
        throw new Error(
          'Package @anthropic-ai/sdk non installé : npm install @anthropic-ai/sdk'
        );
      });

    const startedAt = Date.now();
    const client    = new Anthropic({ apiKey });
    const { system, conversation } = splitSystemMessages(messages);

    const response = await client.messages.create({
      model:      this.resolveModel('ANTHROPIC_MODEL', 'anthropic'),
      max_tokens: this.config.maxTokens,
      system,
      messages:   conversation as { role: 'user' | 'assistant'; content: string }[],
    });

    const content =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    return {
      content,
      tokensUsed: (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0),
      model:      response.model,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Provider : Ollama (local, zéro coût) ──────────────────────────────────

  private async completeOllama(messages: LLMMessage[]): Promise<LLMResponse> {
    const baseUrl   = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
    const model     = this.resolveModel('OLLAMA_MODEL', 'ollama');
    const startedAt = Date.now();

    const data = await fetchJSON<{
      message?:           { content?: string };
      prompt_eval_count?: number;
      eval_count?:        number;
      model?:             string;
    }>(
      `${baseUrl}/api/chat`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: this.config.temperature,
            num_predict: this.config.maxTokens,
          },
        }),
      }
    );

    return {
      content:    data.message?.content ?? '',
      tokensUsed: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      model:      data.model ?? model,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Provider : Google Gemini ──────────────────────────────────────────────

  private async completeGemini(messages: LLMMessage[]): Promise<LLMResponse> {
    const apiKey    = requireEnv('GEMINI_API_KEY');
    const model     = this.resolveModel('GEMINI_MODEL', 'gemini');
    const startedAt = Date.now();

    const { system, conversation } = splitSystemMessages(messages);

    // Gemini attend { role: 'user' | 'model', parts: [{ text }] }
    const geminiMessages = conversation.map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const data = await fetchJSON<{
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount?:     number;
        candidatesTokenCount?: number;
        totalTokenCount?:      number;
      };
      modelVersion?: string;
    }>(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          system_instruction: system ? { parts: [{ text: system }] } : undefined,
          contents:           geminiMessages,
          generationConfig: {
            temperature:     this.config.temperature,
            maxOutputTokens: this.config.maxTokens,
          },
        }),
      }
    );

    return {
      content:    data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      tokensUsed: data.usageMetadata?.totalTokenCount ?? 0,
      model:      data.modelVersion ?? model,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Provider : Mistral AI ─────────────────────────────────────────────────

  private async completeMistral(messages: LLMMessage[]): Promise<LLMResponse> {
    const apiKey    = requireEnv('MISTRAL_API_KEY');
    const model     = this.resolveModel('MISTRAL_MODEL', 'mistral');
    const startedAt = Date.now();

    // Mistral est compatible OpenAI Chat Completions API
    const data = await fetchJSON<{
      choices?: Array<{ message?: { content?: string } }>;
      usage?:   { total_tokens?: number };
      model?:   string;
    }>(
      'https://api.mistral.ai/v1/chat/completions',
      {
        method:  'POST',
        headers: jsonHeaders(apiKey),
        body:    JSON.stringify({
          model,
          messages,
          temperature: this.config.temperature,
          max_tokens:  this.config.maxTokens,
        }),
      }
    );

    return {
      content:    data.choices?.[0]?.message?.content ?? '',
      tokensUsed: data.usage?.total_tokens ?? 0,
      model:      data.model ?? model,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Provider : Cohere ─────────────────────────────────────────────────────

  private async completeCohere(messages: LLMMessage[]): Promise<LLMResponse> {
    const apiKey    = requireEnv('COHERE_API_KEY');
    const model     = this.resolveModel('COHERE_MODEL', 'cohere');
    const startedAt = Date.now();

    const { system, conversation } = splitSystemMessages(messages);

    // Cohere v2 attend { role: 'user' | 'assistant' | 'system', content: string }
    const cohereMessages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...conversation.map(m => ({ role: m.role, content: m.content })),
    ];

    const data = await fetchJSON<{
      message?: { content?: Array<{ type?: string; text?: string }> };
      usage?:   { tokens?: { input_tokens?: number; output_tokens?: number } };
      model?:   string;
      // Fallback API v1
      text?: string;
    }>(
      'https://api.cohere.com/v2/chat',
      {
        method:  'POST',
        headers: {
          ...jsonHeaders(apiKey),
          'X-Client-Name': 'llm-service',
        },
        body: JSON.stringify({
          model,
          messages:    cohereMessages,
          temperature: this.config.temperature,
          max_tokens:  this.config.maxTokens,
        }),
      }
    );

    const content =
      data.message?.content?.find(c => c.type === 'text')?.text ??
      data.text ?? // fallback v1
      '';

    const tokensUsed =
      (data.usage?.tokens?.input_tokens  ?? 0) +
      (data.usage?.tokens?.output_tokens ?? 0);

    return {
      content,
      tokensUsed,
      model:      data.model ?? model,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Provider : Groq ───────────────────────────────────────────────────────

  private async completeGroq(messages: LLMMessage[]): Promise<LLMResponse> {
    const apiKey    = requireEnv('GROQ_API_KEY');
    const model     = this.resolveModel('GROQ_MODEL', 'groq');
    const startedAt = Date.now();

    // Groq est 100% compatible OpenAI Chat Completions API
    const data = await fetchJSON<{
      choices?: Array<{ message?: { content?: string } }>;
      usage?:   { total_tokens?: number };
      model?:   string;
    }>(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method:  'POST',
        headers: jsonHeaders(apiKey),
        body:    JSON.stringify({
          model,
          messages,
          temperature: this.config.temperature,
          max_tokens:  this.config.maxTokens,
        }),
      }
    );

    return {
      content:    data.choices?.[0]?.message?.content ?? '',
      tokensUsed: data.usage?.total_tokens ?? 0,
      model:      data.model ?? model,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Provider : Azure OpenAI ───────────────────────────────────────────────

  private async completeAzureOpenAI(messages: LLMMessage[]): Promise<LLMResponse> {
    const apiKey     = requireEnv('AZURE_OPENAI_API_KEY');
    const endpoint   = requireEnv('AZURE_OPENAI_ENDPOINT'); // https://<resource>.openai.azure.com
    const deployment = this.resolveModel('AZURE_OPENAI_DEPLOYMENT', 'azure-openai');
    const apiVersion = process.env['AZURE_OPENAI_API_VERSION'] ?? '2025-01-01-preview';
    const startedAt  = Date.now();

    // Azure utilise une URL spécifique mais le même format qu'OpenAI
    const url =
      `${endpoint}/openai/deployments/${deployment}` +
      `/chat/completions?api-version=${apiVersion}`;

    const data = await fetchJSON<{
      choices?: Array<{ message?: { content?: string } }>;
      usage?:   { total_tokens?: number };
      model?:   string;
    }>(
      url,
      {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key':      apiKey, // Azure utilise api-key, pas Authorization: Bearer
        },
        body: JSON.stringify({
          messages,
          temperature: this.config.temperature,
          max_tokens:  this.config.maxTokens,
        }),
      }
    );

    return {
      content:    data.choices?.[0]?.message?.content ?? '',
      tokensUsed: data.usage?.total_tokens ?? 0,
      model:      data.model ?? deployment,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Provider : HuggingFace ────────────────────────────────────────────────
  //
  // Supporte deux modes :
  //   • text-generation  → modèles instruct modernes (Mistral, Llama, Phi…)
  //   • conversational   → modèles de dialogue anciens (BlenderBot, DialoGPT…)
  //
  // Supporte deux types d'endpoints :
  //   • Inference API publique  → https://api-inference.huggingface.co/models/<model>
  //   • Inference Endpoint dédié → HF_ENDPOINT_URL (prioritaire)

  private async completeHuggingFace(messages: LLMMessage[]): Promise<LLMResponse> {
    const apiKey      = requireEnv('HF_API_KEY');
    const model       = this.resolveModel('HF_MODEL', 'huggingface');
    const endpointUrl = process.env['HF_ENDPOINT_URL'];
    const task        = (process.env['HF_TASK'] ?? 'text-generation') as HFTask;
    const startedAt   = Date.now();

    // Endpoint dédié prioritaire sur l'Inference API publique
    const url = endpointUrl
      ?? `https://api-inference.huggingface.co/models/${model}`;

    logger.debug('HuggingFace request', { url, task, model });

    const partial = task === 'conversational'
      ? await this.hfConversational(messages, url, apiKey, model)
      : await this.hfTextGeneration(messages, url, apiKey, model);

    return { ...partial, durationMs: Date.now() - startedAt };
  }

  /**
   * Stratégie text-generation — modèles instruct modernes.
   * Construit un prompt ChatML et appelle l'API en mode text-generation.
   */
  private async hfTextGeneration(
    messages: LLMMessage[],
    url:      string,
    apiKey:   string,
    model:    string
  ): Promise<Omit<LLMResponse, 'durationMs'>> {

    const prompt = this.buildChatMLPrompt(messages);

    const data = await fetchJSON<
      // Inference API → tableau
      | Array<{ generated_text?: string; details?: { generated_tokens?: number } }>
      // Endpoint dédié → objet
      | { generated_text?: string; details?: { generated_tokens?: number } }
    >(
      url,
      {
        method:  'POST',
        headers: {
          ...jsonHeaders(apiKey),
          'X-Wait-For-Model': 'true', // attend le chargement du modèle si nécessaire
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens:   this.config.maxTokens,
            temperature:      this.config.temperature,
            return_full_text: false,  // génération seule, sans le prompt
            do_sample:        this.config.temperature > 0,
          },
        }),
      }
    );

    const first = Array.isArray(data) ? data[0] : data;
    const raw   = first?.generated_text ?? '';

    return {
      content:    this.cleanHFOutput(raw),
      tokensUsed: first?.details?.generated_tokens ?? this.estimateTokens(raw),
      model,
    };
  }

  /**
   * Stratégie conversational — modèles de dialogue anciens.
   * Reconstruit l'historique au format attendu par l'API conversational HF.
   */
  private async hfConversational(
    messages: LLMMessage[],
    url:      string,
    apiKey:   string,
    model:    string
  ): Promise<Omit<LLMResponse, 'durationMs'>> {

    const userMessages       = messages.filter(m => m.role === 'user');
    const assistantMessages  = messages.filter(m => m.role === 'assistant');

    // Dernier message = question courante ; le reste = historique
    const currentInput       = userMessages.at(-1)?.content ?? '';
    const pastUserInputs     = userMessages.slice(0, -1).map(m => m.content);
    const generatedResponses = assistantMessages.map(m => m.content);

    const data = await fetchJSON<{
      generated_text?: string;
      conversation?: {
        past_user_inputs?:    string[];
        generated_responses?: string[];
      };
    }>(
      url,
      {
        method:  'POST',
        headers: {
          ...jsonHeaders(apiKey),
          'X-Wait-For-Model': 'true',
        },
        body: JSON.stringify({
          inputs: {
            past_user_inputs:    pastUserInputs,
            generated_responses: generatedResponses,
            text:                currentInput,
          },
          parameters: {
            max_new_tokens: this.config.maxTokens,
            temperature:    this.config.temperature,
          },
        }),
      }
    );

    const content = data.generated_text ?? '';

    return {
      content:    this.cleanHFOutput(content),
      tokensUsed: this.estimateTokens(content),
      model,
    };
  }

  /**
   * Construit un prompt ChatML universel à partir des messages LLM.
   * Reconnu par la majorité des modèles instruct modernes sur HuggingFace.
   *
   * Exemple :
   *   <|im_start|>system
   *   Tu es un assistant expert.<|im_end|>
   *   <|im_start|>user
   *   Bonjour<|im_end|>
   *   <|im_start|>assistant
   */
  private buildChatMLPrompt(messages: LLMMessage[]): string {
    const lines = messages.map(
      msg => `<|im_start|>${msg.role}\n${msg.content}<|im_end|>`
    );
    // Amorce la réponse de l'assistant
    lines.push('<|im_start|>assistant');
    return lines.join('\n');
  }

  /**
   * Supprime les tokens spéciaux et artefacts courants des sorties HF.
   * Ex: <|im_end|>, </s>, préfixe "assistant\n"…
   */
  private cleanHFOutput(text: string): string {
    return text
      .replace(/<\|im_end\|>/g,       '')
      .replace(/<\|im_start\|>\w+\n?/g, '')
      .replace(/<\/s>/g,              '')
      .replace(/^assistant\n?/i,      '')
      .trim();
  }

  /**
   * Estimation grossière du nombre de tokens (1 token ≈ 4 caractères).
   * Fallback quand l'API HF ne retourne pas le compte exact.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // ── Provider : Mock ───────────────────────────────────────────────────────

  private async completeMock(
    agentType?: string,
    prefix?:    string
  ): Promise<LLMResponse> {
    // Simule un délai réseau réaliste (1 à 3 secondes)
    await new Promise(resolve =>
      setTimeout(resolve, 1000 + Math.random() * 2000)
    );

    const base    = MOCK_RESPONSES[agentType ?? 'default'] ?? MOCK_RESPONSES['default'] ?? '';
    const content = prefix ? `> ${prefix}\n\n${base}` : base;

    return {
      content,
      tokensUsed: Math.floor(Math.random() * 500) + 200,
      model:      'mock-v1',
      durationMs: 1500,
    };
  }

  // ── Streaming (simulation universelle par chunks) ──────────────────────────

  async *stream(
    messages:   LLMMessage[],
    agentType?: string,
    onChunk?:   (chunk: string) => void
  ): AsyncGenerator<string> {
    const result = await this.complete(messages, agentType);
    const words  = result.content.split(' ');

    for (const word of words) {
      const chunk = `${word} `;
      onChunk?.(chunk);
      yield chunk;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  // ── Helpers privés ────────────────────────────────────────────────────────

  /**
   * Résout le modèle à utiliser selon la priorité :
   *   1. Modèle configuré via setProvider() ou le constructeur (si différent du défaut OpenAI)
   *   2. Variable d'environnement spécifique au provider
   *   3. Modèle par défaut du provider
   */
  private resolveModel(envVar: string, provider: LLMProvider): string {
    const runtimeModel = this.config.model;
    const defaultModel = DEFAULT_MODELS[provider];

    // Si le modèle runtime a été explicitement surchargé pour ce provider
    if (runtimeModel && runtimeModel !== DEFAULT_MODELS['openai']) {
      return runtimeModel;
    }

    return process.env[envVar] ?? defaultModel;
  }

  private isRateLimitError(error: Error): boolean {
    return (
      error.message.includes('rate_limit')        ||
      error.message.includes('429')               ||
      error.message.includes('too_many_requests') ||
      error.message.includes('RateLimitError')
    );
  }

  private isTimeoutError(error: Error): boolean {
    return (
      error.message.includes('timeout')    ||
      error.message.includes('ETIMEDOUT')  ||
      error.message.includes('AbortError') ||
      error.message.includes('TimeoutError')
    );
  }

  // ── Getters publics ───────────────────────────────────────────────────────

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  getProvider(): LLMProvider {
    return this.config.provider;
  }

  isMockMode(): boolean {
    return this.config.provider === 'mock';
  }

  /**
   * Liste tous les providers avec leur statut de configuration.
   * Utile pour l'interface d'administration.
   */
  getAvailableProviders(): Array<{
    provider:     LLMProvider;
    configured:   boolean;
    defaultModel: string;
  }> {
    return (Object.keys(DEFAULT_MODELS) as LLMProvider[]).map(provider => {
      const env = PROVIDER_ENV[provider];

      const configured =
        provider === 'mock'   ? true :  // toujours disponible
        provider === 'ollama' ? true :  // local, pas de clé requise
        Boolean(env.apiKey && process.env[env.apiKey]);

      return {
        provider,
        configured,
        defaultModel: DEFAULT_MODELS[provider],
      };
    });
  }
}

// ── Singleton partagé dans toute l'application ────────────────────────────────

export const llmService = new LLMService();