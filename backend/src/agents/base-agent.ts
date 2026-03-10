// ═══════════════════════════════════════════════════════════════════════════════
// BaseAgent — Classe abstraite commune à tous les agents AI
// Gère : logs DB, progression, artefacts, WebSocket, retry
// ═══════════════════════════════════════════════════════════════════════════════

import { pool } from '../db/pool';
import logger from '../logger';
import { llmService } from '../services/llm.service';
import { queueService } from '../services/queue.service';
import { wsService } from '../services/websocket.service';
import type {
  AITaskQueue,
  AgentResult,
  AgentArtifact,
  AgentLog,
  ArtifactType,
  LogLevel,
  LLMMessage,
  AgentType,
} from '../types/agents.types';

// ── Classe abstraite ──────────────────────────────────────────────────────────

export abstract class BaseAgent {
  // Chaque sous-classe définit son type et son prompt système
  abstract readonly type: AgentType;
  abstract readonly systemPrompt: string;

  // Méthode principale à implémenter par chaque agent
  abstract execute(task: AITaskQueue): Promise<AgentResult>;

  // ── Méthodes utilitaires partagées ────────────────────────────────────────

  /**
   * Enregistre un log en DB et l'émet en WebSocket
   */
  protected async log(
    task: AITaskQueue,
    step: string,
    message: string,
    level: LogLevel = 'info',
    progress?: number,
    tokensUsed = 0,
    durationMs?: number
  ): Promise<void> {
    try {
      const result = await pool.query<Record<string, unknown>>(
        `INSERT INTO ai_agent_logs
           (task_queue_id, agent_id, issue_id, level, step, message, progress, tokens_used, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [task.id, task.agentId, task.issueId, level, step, message, progress ?? null, tokensUsed, durationMs ?? null]
      );

      const logEntry = this.rowToLog(result.rows[0]!);

      // Émettre en WebSocket
      wsService.broadcast({
        type: 'agent:log',
        issueId: task.issueId,
        log: logEntry,
      });

      // Mise à jour de la progression si fournie
      if (progress !== undefined) {
        await queueService.updateProgress(task.id, progress);
        wsService.broadcast({
          type: 'agent:progress',
          issueId: task.issueId,
          taskQueueId: task.id,
          progress,
          step,
          message,
        });
      }

      logger.debug(`[${this.type}] ${step}: ${message}`, { taskId: task.id, progress });
    } catch (err) {
      logger.error('Erreur lors du log agent', { error: (err as Error).message });
    }
  }

  /**
   * Sauvegarde un artefact en DB et l'émet en WebSocket
   */
  protected async saveArtifact(
    task: AITaskQueue,
    type: ArtifactType,
    content: string,
    filename: string,
    language?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<AgentArtifact> {
    const result = await pool.query<Record<string, unknown>>(
      `INSERT INTO ai_artifacts
         (task_queue_id, issue_id, agent_id, type, filename, content, language, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [task.id, task.issueId, task.agentId, type, filename, content, language ?? null, JSON.stringify(metadata)]
    );

    const artifact = this.rowToArtifact(result.rows[0]!);

    // Émettre en WebSocket (preview des 200 premiers caractères)
    wsService.broadcast({
      type: 'agent:artifact',
      issueId: task.issueId,
      artifact,
    });

    logger.debug(`[${this.type}] Artefact sauvegardé`, {
      taskId: task.id,
      type,
      filename,
      size: content.length,
    });

    return artifact;
  }

  /**
   * Appelle le LLM avec le prompt système de l'agent + le message utilisateur
   */
  protected async callLLM(
    task: AITaskQueue,
    userPrompt: string,
    step: string,
    _temperature = 0.3
  ): Promise<{ content: string; tokensUsed: number; durationMs: number }> {
    const startedAt = Date.now();

    const messages: LLMMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    await this.log(task, step, `Appel LLM en cours (${llmService.getProvider()})...`, 'info');

    const response = await llmService.complete(messages, this.type);

    const durationMs = Date.now() - startedAt;
    await this.log(
      task,
      step,
      `LLM répondu en ${Math.round(durationMs / 1000)}s (${response.tokensUsed} tokens)`,
      'info',
      undefined,
      response.tokensUsed,
      durationMs
    );

    return {
      content: response.content,
      tokensUsed: response.tokensUsed,
      durationMs,
    };
  }

  /**
   * Met à jour le statut de l'issue Jira parente
   */
  protected async updateIssueStatus(
    issueId: string,
    status: 'todo' | 'in-progress' | 'in-review' | 'done'
  ): Promise<void> {
    const prevResult = await pool.query<{ status: string }>(
      `SELECT status FROM issues WHERE id = $1`,
      [issueId]
    );
    const prevStatus = prevResult.rows[0]?.status ?? 'todo';

    await pool.query(
      `UPDATE issues SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, issueId]
    );

    wsService.broadcast({
      type: 'issue:status_changed',
      issueId,
      from: prevStatus,
      to: status,
    });

    logger.info(`Issue ${issueId} status: ${prevStatus} → ${status}`);
  }

  /**
   * Met à jour la progression AI et le résumé de l'issue
   */
  protected async updateIssueAI(
    issueId: string,
    progress: number,
    summary?: string
  ): Promise<void> {
    await pool.query(
      `UPDATE issues
         SET ai_progress = $1,
             ai_summary = COALESCE($2, ai_summary),
             updated_at = NOW()
       WHERE id = $3`,
      [progress, summary ?? null, issueId]
    );
  }

  /**
   * Ajoute un commentaire automatique à l'issue Jira
   */
  protected async addIssueComment(issueId: string, _agentId: string, body: string): Promise<void> {
    await pool.query(
      `INSERT INTO comments (issue_id, author_id, body) VALUES ($1, NULL, $2)`,
      [issueId, body]
    );
  }

  /**
   * Récupère le contexte complet d'une issue (titre, description, instructions AI)
   */
  protected async getIssueContext(issueId: string): Promise<{
    title: string;
    description: string;
    aiInstructions: string;
    type: string;
    priority: string;
    projectId: string;
  }> {
    const result = await pool.query<{
      title: string;
      description: string;
      ai_instructions: string | null;
      type: string;
      priority: string;
      project_id: string;
    }>(
      `SELECT title, description, ai_instructions, type, priority, project_id
         FROM issues WHERE id = $1`,
      [issueId]
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Issue ${issueId} introuvable`);

    return {
      title: row.title,
      description: row.description,
      aiInstructions: row.ai_instructions ?? '',
      type: row.type,
      priority: row.priority,
      projectId: row.project_id,
    };
  }

  // ── Conversions DB → types ────────────────────────────────────────────────

  private rowToLog(row: Record<string, unknown>): AgentLog {
    return {
      id: row['id'] as string,
      taskQueueId: row['task_queue_id'] as string,
      agentId: row['agent_id'] as string,
      issueId: row['issue_id'] as string,
      level: row['level'] as LogLevel,
      step: row['step'] as string,
      message: row['message'] as string,
      progress: row['progress'] as number | undefined,
      artifacts: (row['artifacts'] as unknown[]) ?? [],
      tokensUsed: row['tokens_used'] as number,
      durationMs: row['duration_ms'] as number | undefined,
      createdAt: (row['created_at'] as Date).toISOString(),
    };
  }

  private rowToArtifact(row: Record<string, unknown>): AgentArtifact {
    return {
      id: row['id'] as string,
      taskQueueId: row['task_queue_id'] as string,
      issueId: row['issue_id'] as string,
      agentId: row['agent_id'] as string,
      type: row['type'] as ArtifactType,
      filename: row['filename'] as string,
      content: row['content'] as string,
      language: row['language'] as string | undefined,
      metadata: (row['metadata'] as Record<string, unknown>) ?? {},
      createdAt: (row['created_at'] as Date).toISOString(),
    };
  }
}
