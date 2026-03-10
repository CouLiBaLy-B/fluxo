// ═══════════════════════════════════════════════════════════════════════════════
// Service Confluence Auto — Génération automatique de pages Confluence
// après completion d'une tâche agent
// ═══════════════════════════════════════════════════════════════════════════════

import { pool } from '../db/pool';
import logger from '../logger';
import { llmService } from './llm.service';
import type { AITaskQueue, AgentLog, AgentArtifact } from '../types/agents.types';
import type { LLMMessage } from '../types/agents.types';

export class ConfluenceAutoService {

  // ── Point d'entrée principal ───────────────────────────────────────────────

  async generatePage(task: AITaskQueue, summary: string): Promise<string | null> {
    try {
      // Récupérer les données de l'issue
      const issueResult = await pool.query<{
        title: string;
        description: string;
        type: string;
        key: string;
        project_id: string;
      }>(
        `SELECT title, description, type, key, project_id FROM issues WHERE id = $1`,
        [task.issueId]
      );
      const issue = issueResult.rows[0];
      if (!issue) return null;

      // Récupérer les artefacts produits
      const artifactsResult = await pool.query<AgentArtifact & {
        agent_id: string;
        task_queue_id: string;
        created_at: Date;
      }>(
        `SELECT * FROM ai_artifacts WHERE task_queue_id = $1 ORDER BY created_at ASC`,
        [task.id]
      );
      const artifacts = artifactsResult.rows;

      // Récupérer les logs principaux (steps importants)
      const logsResult = await pool.query<AgentLog & { created_at: Date }>(
        `SELECT * FROM ai_agent_logs
           WHERE task_queue_id = $1
             AND level IN ('success', 'warning', 'error')
           ORDER BY created_at ASC
           LIMIT 20`,
        [task.id]
      );
      const logs = logsResult.rows;

      // Générer le contenu Markdown via LLM
      const content = await this.generateContent(issue, artifacts, logs, summary, task);

      // Trouver l'espace Confluence du projet (ou l'espace par défaut)
      const spaceResult = await pool.query<{ id: string; key: string }>(
        `SELECT cs.id, cs.key
           FROM confluence_spaces cs
           JOIN projects p ON p.key = cs.key
          WHERE p.id = $1
          LIMIT 1`,
        [issue.project_id]
      );

      let spaceId: string;
      let spaceKey: string;

      if (spaceResult.rows[0]) {
        spaceId = spaceResult.rows[0].id;
        spaceKey = spaceResult.rows[0].key;
      } else {
        // Utiliser le premier espace disponible ou créer un espace par défaut
        const defaultSpace = await pool.query<{ id: string; key: string }>(
          `SELECT id, key FROM confluence_spaces LIMIT 1`
        );
        if (!defaultSpace.rows[0]) {
          logger.warn('Aucun espace Confluence trouvé pour la génération auto');
          return null;
        }
        spaceId = defaultSpace.rows[0].id;
        spaceKey = defaultSpace.rows[0].key;
      }

      // Créer la page Confluence
      const pageTitle = `[AI] ${issue.key} — ${issue.title}`;
      const pageResult = await pool.query<{ id: string }>(
        `INSERT INTO confluence_pages
           (space_id, space_key, title, content, author_id, tags, emoji)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          spaceId,
          spaceKey,
          pageTitle,
          content,
          null,
          ['ai-generated', issue.type, 'agent'],
          '🤖',
        ]
      );
      const pageId = pageResult.rows[0]?.id;
      if (!pageId) return null;

      // Créer le lien issue ↔ page
      await pool.query(
        `INSERT INTO issue_confluence_links (issue_id, page_id, link_type, created_by_agent_id)
         VALUES ($1, $2, 'generated', $3)
         ON CONFLICT (issue_id, page_id) DO NOTHING`,
        [task.issueId, pageId, task.agentId]
      );

      // Mettre à jour l'issue avec l'ID de la page Confluence
      await pool.query(
        `UPDATE issues SET confluence_page_id = $1, updated_at = NOW() WHERE id = $2`,
        [pageId, task.issueId]
      );

      logger.info('Page Confluence créée automatiquement', { pageId, issueId: task.issueId });
      return pageId;

    } catch (err) {
      logger.error('Erreur génération page Confluence', { error: (err as Error).message });
      return null;
    }
  }

  // ── Génération du contenu Markdown via LLM ────────────────────────────────

  private async generateContent(
    issue: { title: string; description: string; type: string; key: string },
    artifacts: { type: string; filename: string; content: string; language?: string | null }[],
    logs: { step: string; message: string; level: string }[],
    summary: string,
    _task: AITaskQueue
  ): Promise<string> {
    // Résumé des artefacts (sans le contenu complet pour limiter les tokens)
    const artifactsSummary = artifacts.map(a =>
      `- **${a.filename}** (${a.type}${a.language ? `, ${a.language}` : ''})`
    ).join('\n');

    // Extraire le premier artefact code (pour l'inclusion partielle)
    const codeArtifact = artifacts.find(a => a.type === 'code');
    const codePreview = codeArtifact
      ? `\n\n**Extrait de code** (\`${codeArtifact.filename}\`) :\n\`\`\`${codeArtifact.language ?? 'typescript'}\n${codeArtifact.content.substring(0, 1000)}${codeArtifact.content.length > 1000 ? '\n// ...' : ''}\n\`\`\``
      : '';

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `Tu es un expert en documentation technique.
Tu génères des pages Confluence structurées en Markdown GitHub-flavored.
La page doit être professionnelle, complète et directement utilisable.`,
      },
      {
        role: 'user',
        content: `Génère une page Confluence complète pour cette tâche réalisée par un agent AI.

## Issue
- **Clé** : ${issue.key}
- **Titre** : ${issue.title}
- **Type** : ${issue.type}
- **Description** : ${issue.description.substring(0, 500)}

## Résumé du travail accompli
${summary}

## Artefacts produits
${artifactsSummary || 'Aucun artefact produit'}
${codePreview}

## Étapes réalisées
${logs.map(l => `- **${l.step}** : ${l.message}`).join('\n') || 'Exécution en mode mock'}

Structure la page avec ces sections :
1. Résumé exécutif
2. Contexte et objectif
3. Travail réalisé par l'agent
4. Artefacts produits (avec description)
5. Code / Tests générés (si applicable, inclure l'extrait)
6. Décisions techniques
7. Prochaines étapes recommandées
8. Métadonnées (date, agent, tokens utilisés)`,
      },
    ];

    const response = await llmService.complete(messages, 'writer');
    return response.content;
  }
}

// Singleton partagé
export const confluenceAutoService = new ConfluenceAutoService();
