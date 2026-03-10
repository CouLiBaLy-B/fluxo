// ═══════════════════════════════════════════════════════════════════════════════
// Service Queue — File d'attente des tâches AI (sans Redis, sans Bull)
// Persistance PostgreSQL + état en mémoire + setInterval pour le polling
// ═══════════════════════════════════════════════════════════════════════════════

import { pool } from '../db/pool';
import logger from '../logger';
import type { AITaskQueue, TaskQueueStatus, QueueStats, AgentStats } from '../types/agents.types';

// Délai entre deux cycles de polling (ms)
const POLL_INTERVAL_MS = 5000;

// Type pour les callbacks d'exécution
type TaskExecutor = (task: AITaskQueue) => Promise<void>;

// ── Classe principale ─────────────────────────────────────────────────────────

export class QueueService {
  // Tâches en cours d'exécution en mémoire (taskQueueId → Promise)
  private readonly runningTasks = new Map<string, Promise<void>>();
  // Nombre de tâches actives par agent (agentId → count)
  private readonly agentConcurrency = new Map<string, number>();
  // Exécuteur enregistré par l'orchestrateur
  private executor: TaskExecutor | null = null;
  // Handle du setInterval
  private pollHandle: NodeJS.Timeout | null = null;
  private isPolling = false;

  // ── Démarrage du service ───────────────────────────────────────────────────

  start(executor: TaskExecutor): void {
    this.executor = executor;
    this.pollHandle = setInterval(() => {
      void this.poll();
    }, POLL_INTERVAL_MS);
    // Premier poll immédiat au démarrage
    void this.poll();
    logger.info('QueueService démarré', { pollIntervalMs: POLL_INTERVAL_MS });
  }

  stop(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    logger.info('QueueService arrêté');
  }

  // ── Polling : récupère les tâches pending et les démarre ──────────────────

  private async poll(): Promise<void> {
    if (this.isPolling || !this.executor) return;
    this.isPolling = true;

    try {
      // Récupère les tâches en attente, triées par priorité puis date
      const result = await pool.query<Record<string, unknown>>(
        `SELECT
           q.*,
           a.max_concurrent_tasks AS agent_max_concurrent
         FROM ai_task_queue q
         JOIN ai_agents a ON a.id = q.agent_id
         WHERE q.status = 'pending'
           AND a.is_active = true
         ORDER BY q.priority ASC, q.created_at ASC
         LIMIT 20`
      );

      for (const row of result.rows) {
        const task = this.rowToTask(row);
        const agentId = task.agentId;
        const maxConcurrent = (row as { agent_max_concurrent: number }).agent_max_concurrent;
        const currentCount = this.agentConcurrency.get(agentId) ?? 0;

        // Vérifier la limite de concurrence par agent
        if (currentCount >= maxConcurrent) continue;
        // Ne pas relancer une tâche déjà en cours en mémoire
        if (this.runningTasks.has(task.id)) continue;

        // Démarrer la tâche
        void this.startTask(task);
      }
    } catch (err) {
      logger.error('Erreur polling queue', { error: (err as Error).message });
    } finally {
      this.isPolling = false;
    }
  }

  // ── Démarrage d'une tâche ─────────────────────────────────────────────────

  private async startTask(task: AITaskQueue): Promise<void> {
    if (!this.executor) return;

    // Marquer comme running en DB (atomic update pour éviter les doublons)
    const updated = await pool.query(
      `UPDATE ai_task_queue
         SET status = 'running', started_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [task.id]
    );

    // Si la mise à jour n'a rien retourné, une autre instance a pris la tâche
    if (updated.rowCount === 0) return;

    // Incrémenter le compteur de concurrence
    const agentId = task.agentId;
    this.agentConcurrency.set(agentId, (this.agentConcurrency.get(agentId) ?? 0) + 1);

    const promise = this.executor(task)
      .catch(err => {
        logger.error('Exécution tâche échouée', { taskId: task.id, error: (err as Error).message });
      })
      .finally(() => {
        // Nettoyer le tracking en mémoire
        this.runningTasks.delete(task.id);
        const count = this.agentConcurrency.get(agentId) ?? 1;
        this.agentConcurrency.set(agentId, Math.max(0, count - 1));
      });

    this.runningTasks.set(task.id, promise);
  }

  // ── CRUD tâches ───────────────────────────────────────────────────────────

  async enqueue(
    issueId: string,
    agentId: string,
    instructions: string,
    priority = 5,
    context: Record<string, unknown> = {}
  ): Promise<AITaskQueue> {
    const result = await pool.query<Record<string, unknown>>(
      `INSERT INTO ai_task_queue
         (issue_id, agent_id, status, priority, instructions, context)
       VALUES ($1, $2, 'pending', $3, $4, $5)
       RETURNING *`,
      [issueId, agentId, priority, instructions, JSON.stringify(context)]
    );
    const task = this.rowToTask(result.rows[0]!);
    logger.info('Tâche ajoutée à la queue', { taskId: task.id, issueId, agentId, priority });
    return task;
  }

  async updateProgress(taskId: string, progress: number): Promise<void> {
    await pool.query(
      `UPDATE ai_task_queue SET progress = $1, updated_at = NOW() WHERE id = $2`,
      [Math.min(100, Math.max(0, progress)), taskId]
    );
  }

  async complete(taskId: string): Promise<void> {
    await pool.query(
      `UPDATE ai_task_queue
         SET status = 'completed', progress = 100, completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [taskId]
    );
    logger.info('Tâche complétée', { taskId });
  }

  async fail(taskId: string, errorMessage: string, scheduleRetry = true): Promise<void> {
    const result = await pool.query<{ retry_count: number; max_retries: number }>(
      `SELECT retry_count, max_retries FROM ai_task_queue WHERE id = $1`,
      [taskId]
    );
    const row = result.rows[0];
    if (!row) return;

    const retryCount = row.retry_count + 1;
    const canRetry = scheduleRetry && retryCount < row.max_retries;

    if (canRetry) {
      // Remettre en pending avec un compteur de retry incrémenté
      await pool.query(
        `UPDATE ai_task_queue
           SET status = 'pending', retry_count = $1, error_message = $2, updated_at = NOW()
         WHERE id = $3`,
        [retryCount, errorMessage, taskId]
      );
      logger.warn('Tâche reschedulée après échec', { taskId, retryCount, maxRetries: row.max_retries });
    } else {
      await pool.query(
        `UPDATE ai_task_queue
           SET status = 'failed', retry_count = $1, error_message = $2,
               completed_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [retryCount, errorMessage, taskId]
      );
      logger.error('Tâche définitivement échouée', { taskId, retryCount });
    }
  }

  async pause(taskId: string): Promise<void> {
    await pool.query(
      `UPDATE ai_task_queue SET status = 'paused', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );
  }

  async resume(taskId: string): Promise<void> {
    await pool.query(
      `UPDATE ai_task_queue SET status = 'pending', updated_at = NOW() WHERE id = $1 AND status = 'paused'`,
      [taskId]
    );
  }

  async cancel(taskId: string): Promise<void> {
    await pool.query(
      `UPDATE ai_task_queue
         SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'paused')`,
      [taskId]
    );
    logger.info('Tâche annulée', { taskId });
  }

  // ── Requêtes ──────────────────────────────────────────────────────────────

  async getTaskByIssueId(issueId: string): Promise<AITaskQueue | null> {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT q.*, a.name AS agent_name, a.avatar_emoji, a.avatar_color, a.type AS agent_type
         FROM ai_task_queue q
         JOIN ai_agents a ON a.id = q.agent_id
        WHERE q.issue_id = $1
        ORDER BY q.created_at DESC
        LIMIT 1`,
      [issueId]
    );
    if (result.rows.length === 0) return null;
    return this.rowToTask(result.rows[0]!);
  }

  async getTaskById(taskId: string): Promise<AITaskQueue | null> {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM ai_task_queue WHERE id = $1`,
      [taskId]
    );
    if (result.rows.length === 0) return null;
    return this.rowToTask(result.rows[0]!);
  }

  async getTasksByAgentId(agentId: string, limit = 20): Promise<AITaskQueue[]> {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM ai_task_queue WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [agentId, limit]
    );
    return result.rows.map((row: Record<string, unknown>) => this.rowToTask(row));
  }

  async getActiveTasksCount(agentId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ai_task_queue WHERE agent_id = $1 AND status = 'running'`,
      [agentId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  // ── Statistiques globales ─────────────────────────────────────────────────

  async getStats(): Promise<QueueStats> {
    const globalResult = await pool.query<{
      status: TaskQueueStatus;
      count: string;
    }>(
      `SELECT status, COUNT(*) AS count FROM ai_task_queue GROUP BY status`
    );

    const counts: Record<string, number> = {};
    for (const row of globalResult.rows) {
      counts[row.status] = parseInt(row.count, 10);
    }

    const agentStatsResult = await pool.query<{
      agent_id: string;
      total: string;
      completed: string;
      failed: string;
      pending: string;
      running: string;
      total_tokens: string;
      avg_duration: string;
      completed_today: string;
    }>(
      `SELECT
         q.agent_id,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE q.status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE q.status = 'failed') AS failed,
         COUNT(*) FILTER (WHERE q.status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE q.status = 'running') AS running,
         COALESCE(SUM(l.tokens_used), 0) AS total_tokens,
         COALESCE(AVG(
           EXTRACT(EPOCH FROM (q.completed_at - q.started_at)) * 1000
         ) FILTER (WHERE q.completed_at IS NOT NULL), 0) AS avg_duration,
         COUNT(*) FILTER (WHERE q.status = 'completed' AND q.completed_at > NOW() - INTERVAL '1 day') AS completed_today
       FROM ai_task_queue q
       LEFT JOIN ai_agent_logs l ON l.task_queue_id = q.id
       GROUP BY q.agent_id`
    );

    const agentStats: AgentStats[] = agentStatsResult.rows.map((row: Record<string, string>) => ({
      agentId: row.agent_id,
      totalTasks: parseInt(row.total, 10),
      completedTasks: parseInt(row.completed, 10),
      failedTasks: parseInt(row.failed, 10),
      pendingTasks: parseInt(row.pending, 10),
      runningTasks: parseInt(row.running, 10),
      totalTokensUsed: parseInt(row.total_tokens, 10),
      avgDurationMs: Math.round(parseFloat(row.avg_duration)),
      successRate: parseInt(row.total, 10) > 0
        ? Math.round((parseInt(row.completed, 10) / parseInt(row.total, 10)) * 100)
        : 0,
      completedToday: parseInt(row.completed_today, 10),
    }));

    return {
      totalPending: counts['pending'] ?? 0,
      totalRunning: counts['running'] ?? 0,
      totalCompleted: counts['completed'] ?? 0,
      totalFailed: counts['failed'] ?? 0,
      totalCancelled: counts['cancelled'] ?? 0,
      agentStats,
    };
  }

  // ── Conversion ligne DB → objet TypeScript ────────────────────────────────

  private rowToTask(row: Record<string, unknown>): AITaskQueue {
    return {
      id: row['id'] as string,
      issueId: row['issue_id'] as string,
      agentId: row['agent_id'] as string,
      status: row['status'] as TaskQueueStatus,
      priority: row['priority'] as number,
      instructions: row['instructions'] as string,
      context: (row['context'] as Record<string, unknown>) ?? {},
      progress: row['progress'] as number,
      startedAt: row['started_at'] ? (row['started_at'] as Date).toISOString() : undefined,
      completedAt: row['completed_at'] ? (row['completed_at'] as Date).toISOString() : undefined,
      errorMessage: row['error_message'] as string | undefined,
      retryCount: row['retry_count'] as number,
      maxRetries: row['max_retries'] as number,
      createdAt: (row['created_at'] as Date).toISOString(),
      updatedAt: (row['updated_at'] as Date).toISOString(),
    };
  }
}

// Singleton partagé
export const queueService = new QueueService();
