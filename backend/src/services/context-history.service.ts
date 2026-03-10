// ═══════════════════════════════════════════════════════════════════════════════
// ContextHistoryService — Persistance et requêtage de l'historique du contexte AI
//
// Ce service sauvegarde un snapshot complet du workspace après chaque tâche AI
// (fichiers, résultats build/test, métriques GitHub) et permet de reconstruire
// une "mémoire de projet" à injecter dans les prompts des tâches futures.
//
// Le chaînage parent/enfant (parent_history_id) forme une chaîne temporelle
// permettant de retracer l'évolution d'un projet tâche après tâche.
// ═══════════════════════════════════════════════════════════════════════════════

import { pool } from '../db/pool';
import logger from '../logger';
import { wsService } from './websocket.service';
import type { SandboxExecResult } from './sandbox.service';
import type { AgentWSEvent } from '../types/agents.types';

// ── Interfaces exportées ──────────────────────────────────────────────────────

/** Snapshot complet du contexte d'une tâche AI */
export interface ContextSnapshot {
  // Workspace
  fileTree: string[];
  fileContents: Record<string, string>;
  totalSizeBytes: number;
  // Build & Test
  buildResult: SandboxExecResult | null;
  testResult: SandboxExecResult | null;
  // GitHub
  githubRepoUrl: string | null;
  githubCommitSha: string | null;
  githubBranch: string;
  // AI
  aiSummary: string | null;
  systemPromptUsed: string | null;
  // Métriques
  totalTokensUsed: number;
  totalDurationMs: number;
  filesCount: number;
  claudeCodeTurns: number | null;
  // Chaînage
  parentHistoryId: string | null;
  tags: string[];
}

/** Enregistrement complet avec métadonnées DB */
export interface ContextHistoryRecord extends ContextSnapshot {
  id: string;
  taskQueueId: string;
  issueId: string;
  projectId: string;
  agentId: string;
  createdAt: string;
}

// ── Options ───────────────────────────────────────────────────────────────────

interface GetProjectHistoryOptions {
  limit?: number;
  offset?: number;
  tags?: string[];
}

interface BuildProjectMemoryOptions {
  maxSnapshots?: number;
  includeFileTree?: boolean;
  includeCode?: boolean;
  maxCodeLength?: number;
}

// ── Classe principale ─────────────────────────────────────────────────────────

class ContextHistoryService {

  // ── Méthodes privées ──────────────────────────────────────────────────────

  /**
   * Convertit une ligne DB (snake_case) en ContextHistoryRecord (camelCase).
   * Même pattern que BaseAgent.rowToLog / rowToArtifact.
   */
  private rowToRecord(row: Record<string, unknown>): ContextHistoryRecord {
    return {
      id:              row['id'] as string,
      taskQueueId:     row['task_queue_id'] as string,
      issueId:         row['issue_id'] as string,
      projectId:       row['project_id'] as string,
      agentId:         row['agent_id'] as string,
      // Workspace
      fileTree:        (row['file_tree'] as string[]) ?? [],
      fileContents:    (row['file_contents'] as Record<string, string>) ?? {},
      totalSizeBytes:  (row['total_size_bytes'] as number) ?? 0,
      // Build & Test
      buildResult:     (row['build_result'] as SandboxExecResult | null) ?? null,
      testResult:      (row['test_result'] as SandboxExecResult | null) ?? null,
      // GitHub
      githubRepoUrl:   (row['github_repo_url'] as string | null) ?? null,
      githubCommitSha: (row['github_commit_sha'] as string | null) ?? null,
      githubBranch:    (row['github_branch'] as string) ?? 'main',
      // AI
      aiSummary:         (row['ai_summary'] as string | null) ?? null,
      systemPromptUsed:  (row['system_prompt_used'] as string | null) ?? null,
      // Métriques
      totalTokensUsed: (row['total_tokens_used'] as number) ?? 0,
      totalDurationMs: (row['total_duration_ms'] as number) ?? 0,
      filesCount:      (row['files_count'] as number) ?? 0,
      claudeCodeTurns: (row['claude_code_turns'] as number | null) ?? null,
      // Chaînage
      parentHistoryId: (row['parent_history_id'] as string | null) ?? null,
      tags:            (row['tags'] as string[]) ?? [],
      createdAt:       (row['created_at'] as Date).toISOString(),
    };
  }

  /**
   * Tronque un texte à maxLength caractères en ajoutant un marqueur de troncature.
   */
  private truncateForContext(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '\n[...]';
  }

  // ── Sauvegarde ────────────────────────────────────────────────────────────

  /**
   * Sauvegarde un snapshot de contexte en base de données.
   * Détermine automatiquement le parent_history_id (dernier snapshot du projet).
   * Émet un événement WebSocket context:historized.
   */
  async save(
    taskQueueId: string,
    issueId: string,
    projectId: string,
    agentId: string,
    snapshot: ContextSnapshot
  ): Promise<ContextHistoryRecord> {
    logger.info('[ContextHistoryService] Sauvegarde du snapshot', {
      taskQueueId,
      projectId,
      filesCount: snapshot.filesCount,
      totalSizeBytes: snapshot.totalSizeBytes,
    });

    // Rechercher le dernier snapshot du même projet pour le chaînage
    const parentResult = await pool.query<{ id: string }>(
      `SELECT id FROM ai_context_history
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [projectId]
    );
    const parentHistoryId = parentResult.rows[0]?.id ?? null;

    // Insertion du snapshot
    const insertResult = await pool.query<Record<string, unknown>>(
      `INSERT INTO ai_context_history (
        task_queue_id, issue_id, project_id, agent_id,
        file_tree, file_contents, total_size_bytes,
        build_result, test_result,
        github_repo_url, github_commit_sha, github_branch,
        ai_summary, system_prompt_used,
        total_tokens_used, total_duration_ms, files_count, claude_code_turns,
        parent_history_id, tags
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9,
        $10, $11, $12,
        $13, $14,
        $15, $16, $17, $18,
        $19, $20
      )
      RETURNING *`,
      [
        taskQueueId,
        issueId,
        projectId,
        agentId,
        JSON.stringify(snapshot.fileTree),
        JSON.stringify(snapshot.fileContents),
        snapshot.totalSizeBytes,
        snapshot.buildResult ? JSON.stringify(snapshot.buildResult) : null,
        snapshot.testResult  ? JSON.stringify(snapshot.testResult)  : null,
        snapshot.githubRepoUrl,
        snapshot.githubCommitSha,
        snapshot.githubBranch,
        snapshot.aiSummary,
        snapshot.systemPromptUsed,
        snapshot.totalTokensUsed,
        snapshot.totalDurationMs,
        snapshot.filesCount,
        snapshot.claudeCodeTurns,
        parentHistoryId,
        JSON.stringify(snapshot.tags),
      ]
    );

    const record = this.rowToRecord(insertResult.rows[0]!);

    // Émettre l'événement WebSocket (cast nécessaire : context:historized n'est
    // pas dans AgentWSEvent mais agents.types.ts ne doit pas être modifié)
    wsService.broadcast({
      type: 'context:historized',
      issueId,
      projectId,
      historyId: record.id,
      filesCount: record.filesCount,
      totalSizeBytes: record.totalSizeBytes,
    } as unknown as AgentWSEvent);

    logger.info('[ContextHistoryService] Snapshot sauvegardé', {
      historyId: record.id,
      parentHistoryId: record.parentHistoryId,
      filesCount: record.filesCount,
    });

    return record;
  }

  // ── Requêtes ──────────────────────────────────────────────────────────────

  /**
   * Récupère l'historique des snapshots d'un projet, du plus récent au plus ancien.
   */
  async getProjectHistory(
    projectId: string,
    options: GetProjectHistoryOptions = {}
  ): Promise<ContextHistoryRecord[]> {
    const { limit = 20, offset = 0, tags } = options;

    let query = `SELECT * FROM ai_context_history WHERE project_id = $1`;
    const params: unknown[] = [projectId];
    let paramIdx = 2;

    // Filtre optionnel sur les tags (opérateur @> = "contient tous ces tags")
    if (tags && tags.length > 0) {
      query += ` AND tags @> $${paramIdx}::jsonb`;
      params.push(JSON.stringify(tags));
      paramIdx++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit, offset);

    const result = await pool.query<Record<string, unknown>>(query, params);
    return result.rows.map(row => this.rowToRecord(row));
  }

  /**
   * Récupère le dernier snapshot d'un projet.
   * Retourne null si aucun snapshot n'existe encore.
   */
  async getLatestForProject(projectId: string): Promise<ContextHistoryRecord | null> {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM ai_context_history
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [projectId]
    );
    return result.rows[0] ? this.rowToRecord(result.rows[0]) : null;
  }

  /**
   * Récupère tous les snapshots liés à une issue Jira.
   */
  async getByIssue(issueId: string): Promise<ContextHistoryRecord[]> {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM ai_context_history
       WHERE issue_id = $1
       ORDER BY created_at DESC`,
      [issueId]
    );
    return result.rows.map(row => this.rowToRecord(row));
  }

  /**
   * Récupère un snapshot par son identifiant unique.
   */
  async getById(historyId: string): Promise<ContextHistoryRecord | null> {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM ai_context_history WHERE id = $1`,
      [historyId]
    );
    return result.rows[0] ? this.rowToRecord(result.rows[0]) : null;
  }

  /**
   * Remonte la chaîne des ancêtres d'un snapshot via CTE récursif SQL.
   * Retourne du plus ancien au plus récent (ordre chronologique).
   */
  async getAncestorChain(
    historyId: string,
    maxDepth: number = 10
  ): Promise<ContextHistoryRecord[]> {
    const result = await pool.query<Record<string, unknown>>(
      `WITH RECURSIVE chain AS (
        -- Cas de base : le snapshot demandé
        SELECT *, 0 AS depth
        FROM ai_context_history
        WHERE id = $1

        UNION ALL

        -- Remontée récursive vers les ancêtres
        SELECT h.*, c.depth + 1
        FROM ai_context_history h
        INNER JOIN chain c ON h.id = c.parent_history_id
        WHERE c.depth < $2
      )
      SELECT * FROM chain ORDER BY depth DESC`,
      [historyId, maxDepth]
    );

    return result.rows.map(row => this.rowToRecord(row));
  }

  // ── Mémoire de projet ─────────────────────────────────────────────────────

  /**
   * Construit un résumé textuel de l'historique du projet destiné à être
   * injecté dans CLAUDE.md comme contexte pour les nouvelles tâches.
   *
   * Limite la sortie à 8000 caractères pour ne pas exploser la fenêtre LLM.
   */
  async buildProjectMemory(
    projectId: string,
    options: BuildProjectMemoryOptions = {}
  ): Promise<string> {
    const {
      maxSnapshots = 5,
      includeFileTree = true,
      includeCode = false,
      maxCodeLength = 2000,
    } = options;

    // Récupérer les derniers snapshots du projet (du plus récent au plus ancien)
    const snapshots = await this.getProjectHistory(projectId, { limit: maxSnapshots });

    if (snapshots.length === 0) {
      return '';
    }

    // Construire du plus ancien au plus récent pour une lecture naturelle
    const orderedSnapshots = [...snapshots].reverse();

    const MAX_TOTAL_LENGTH = 8000;
    const blocks: string[] = [];
    let totalLength = 0;

    const header = `## Historique du projet (${orderedSnapshots.length} tâche(s) précédente(s))\n\n`;
    totalLength += header.length;

    for (let i = 0; i < orderedSnapshots.length; i++) {
      const snap = orderedSnapshots[i]!;
      const date = new Date(snap.createdAt).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });

      const buildStatus = snap.buildResult
        ? (snap.buildResult.exitCode === 0 ? '✅ succès' : '❌ échec')
        : '—';
      const testStatus = snap.testResult
        ? (snap.testResult.exitCode === 0 ? '✅ succès' : '❌ échec')
        : '—';

      let block = `=== Tâche #${i + 1} — ${date} ===\n`;

      // Résumé AI
      if (snap.aiSummary) {
        block += `Résumé: ${this.truncateForContext(snap.aiSummary, 300)}\n`;
      }

      // Arbre de fichiers
      if (includeFileTree && snap.fileTree.length > 0) {
        block += `Fichiers (${snap.fileTree.length}): ${snap.fileTree.slice(0, 20).join(', ')}`;
        if (snap.fileTree.length > 20) block += ` ... (+${snap.fileTree.length - 20} autres)`;
        block += '\n';
      }

      block += `Build: ${buildStatus} | Tests: ${testStatus}\n`;

      // GitHub
      if (snap.githubRepoUrl) {
        block += `GitHub: ${snap.githubRepoUrl}`;
        if (snap.githubCommitSha) {
          block += ` @ ${snap.githubCommitSha.substring(0, 8)}`;
        }
        block += '\n';
      }

      // Tags
      if (snap.tags.length > 0) {
        block += `Tags: [${snap.tags.join(', ')}]\n`;
      }

      // Extraits de code clés (fichiers src/ uniquement)
      if (includeCode && snap.fileContents) {
        const srcFiles = Object.entries(snap.fileContents)
          .filter(([path]) => path.startsWith('src/') && !path.includes('.test.') && !path.includes('.spec.'));

        if (srcFiles.length > 0) {
          block += `Extraits de code clés:\n`;
          let codeLength = 0;
          for (const [filepath, content] of srcFiles) {
            if (codeLength >= maxCodeLength) break;
            const preview = content.split('\n').slice(0, 50).join('\n');
            const truncated = this.truncateForContext(preview, maxCodeLength - codeLength);
            block += `\`\`\`typescript\n// ${filepath}\n${truncated}\n\`\`\`\n`;
            codeLength += truncated.length;
          }
        }
      }

      block += '\n';

      // Vérifier qu'on ne dépasse pas la limite totale
      if (totalLength + block.length > MAX_TOTAL_LENGTH) {
        // Ajouter un résumé tronqué et arrêter
        blocks.push(`[... ${orderedSnapshots.length - i} tâche(s) plus ancienne(s) non affichées]\n`);
        break;
      }

      blocks.push(block);
      totalLength += block.length;
    }

    return header + blocks.join('');
  }

  // ── Nettoyage ─────────────────────────────────────────────────────────────

  /**
   * Supprime les anciens snapshots d'un projet en ne gardant que les keepLast
   * plus récents. Utile pour éviter une croissance illimitée de la table.
   * Retourne le nombre de lignes supprimées.
   */
  async cleanup(projectId: string, keepLast: number = 50): Promise<number> {
    logger.info('[ContextHistoryService] Nettoyage des anciens snapshots', {
      projectId,
      keepLast,
    });

    const result = await pool.query<{ count: string }>(
      `WITH kept AS (
        SELECT id FROM ai_context_history
        WHERE project_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      )
      DELETE FROM ai_context_history
      WHERE project_id = $1
        AND id NOT IN (SELECT id FROM kept)
      RETURNING id`,
      [projectId, keepLast]
    );

    const deletedCount = result.rowCount ?? 0;
    logger.info('[ContextHistoryService] Nettoyage terminé', {
      projectId,
      deletedCount,
      kept: keepLast,
    });

    return deletedCount;
  }
}

// ── Export singleton ──────────────────────────────────────────────────────────

export const contextHistoryService = new ContextHistoryService();
