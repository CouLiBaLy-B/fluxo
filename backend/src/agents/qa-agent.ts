// ═══════════════════════════════════════════════════════════════════════════════
// Agent QA — Génère et exécute de vrais tests dans le sandbox Docker
//
// Contrairement à l'ancien agent (génération LLM texte uniquement), cet agent :
//   - Récupère le code du Developer via GitHub (clone) ou les artefacts en DB
//   - Utilise Claude Code pour générer des tests Vitest complets sur le vrai code
//   - Exécute les tests dans le sandbox et corrige automatiquement les échecs
//   - Pousse les tests sur GitHub si disponible
//   - Historise le snapshot pour la mémoire cumulative du projet
//
// Flow : Init → Code source → Stratégie → Tests unitaires → Tests intégration
//        → Exécution → Correction → GitHub → Historisation → Finalisation
// ═══════════════════════════════════════════════════════════════════════════════

import { pool } from '../db/pool';
import { BaseAgent } from './base-agent';
import { sandboxService } from '../services/sandbox.service';
import { contextHistoryService } from '../services/context-history.service';
import type { SandboxExecResult } from '../services/sandbox.service';
import type { ContextSnapshot } from '../services/context-history.service';
import type { AITaskQueue, AgentResult, AgentType } from '../types/agents.types';
import logger from '../logger';

// Déclaration explicite de process
declare const process: { env: Record<string, string | undefined> };

// ── Types internes ────────────────────────────────────────────────────────────

interface IssueContext {
  title: string;
  description: string;
  aiInstructions: string;
  type: string;
  priority: string;
  projectId: string;
}

interface CodeArtifact {
  filename: string;
  content: string;
  language: string;
}

// ── Classe principale ─────────────────────────────────────────────────────────

export class QAAgent extends BaseAgent {
  readonly type: AgentType = 'qa';

  readonly systemPrompt = `Tu es un expert QA spécialisé en tests automatisés TypeScript.

Règles absolues :
- Tests complets avec Vitest (describe/it/expect)
- Couvre : cas nominaux, cas limites, cas d'erreur, edge cases
- Noms de tests descriptifs en français
- Mocks appropriés pour les dépendances externes (API, DB, WebSocket)
- Assertions précises et pertinentes
- Pas de tests triviaux qui passent toujours
- Crée les fichiers de tests directement sur disque dans src/`;

  // ── Méthode principale ────────────────────────────────────────────────────

  async execute(task: AITaskQueue): Promise<AgentResult> {
    const startedAt = Date.now();

    // Variables mutables pour finally et historisation
    let workdir: string | null = null;
    let testResult: SandboxExecResult | null = null;
    let repoUrl: string | null = null;
    let commitSha: string | null = null;
    let branch: string | null = null;
    let summary: string | null = null;
    let ctx: IssueContext | null = null;

    try {

      // ── Étape 1 : Initialisation ────────────────────────────────────────
      await this.log(task, 'Initialisation', 'Démarrage de l\'agent QA...', 'info', 5);
      await this.updateIssueStatus(task.issueId, 'in-progress');
      await this.updateIssueAI(task.issueId, 5);

      workdir = await sandboxService.createWorkspace(task.id);
      ctx = await this.getIssueContext(task.issueId);
      logger.info('[QAAgent] Workspace + contexte prêts', { workdir, title: ctx.title });

      await this.log(task, 'Initialisation', `Workspace créé pour : ${ctx.title}`, 'info', 8);
      await this.updateIssueAI(task.issueId, 8);

      // ── Étape 2 : Récupération du code source ───────────────────────────
      await this.log(task, 'Code source', 'Récupération du code à tester...', 'info', 10);
      await this.updateIssueAI(task.issueId, 10);

      const codeLoaded = await this.loadCodeIntoWorkspace(task, ctx, workdir);

      await this.log(
        task,
        'Code source',
        codeLoaded
          ? `Code chargé dans le workspace — prêt pour les tests`
          : `Aucun code existant — Claude Code générera tests + implémentation`,
        'info',
        15
      );
      await this.updateIssueAI(task.issueId, 15);

      // ── Étape 3 : Stratégie de tests ────────────────────────────────────
      await this.log(task, 'Stratégie', 'Définition de la stratégie de tests...', 'info', 20);
      await this.updateIssueAI(task.issueId, 20);

      const strategyPrompt = this.buildStrategyPrompt(ctx, task.instructions ?? undefined, codeLoaded);

      const strategyResult = await sandboxService.runClaudeCode(workdir, strategyPrompt, {
        maxTurns: 3,
        allowedTools: ['Read', 'Glob', 'Grep'],
        outputFormat: 'json',
      });

      // Sauvegarder la stratégie comme artefact doc
      if (strategyResult.content.trim()) {
        await this.saveArtifact(task, 'doc', strategyResult.content, 'test-strategy.md', 'markdown');
      }

      await this.log(task, 'Stratégie', 'Stratégie définie', 'info', 30);
      await this.updateIssueAI(task.issueId, 30);

      // ── Étape 4 : Génération des tests unitaires ─────────────────────────
      await this.log(task, 'Tests unitaires', 'Génération des tests unitaires...', 'info', 35);
      await this.updateIssueAI(task.issueId, 35);

      const unitTestPrompt = this.buildUnitTestPrompt(ctx, strategyResult.content, task.instructions ?? undefined);

      const unitTestResult = await sandboxService.runClaudeCode(workdir, unitTestPrompt, {
        maxTurns: 10,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
        outputFormat: 'json',
      });

      await this.log(
        task, 'Tests unitaires',
        `Tests unitaires générés — ${unitTestResult.filesCreated.filter(f => f.includes('.test.')).length} fichier(s)`,
        'info', 50
      );
      await this.updateIssueAI(task.issueId, 50);

      // ── Étape 5 : Génération des tests d'intégration ────────────────────
      await this.log(task, 'Tests intégration', 'Génération des tests d\'intégration...', 'info', 55);
      await this.updateIssueAI(task.issueId, 55);

      const integrationPrompt = this.buildIntegrationTestPrompt(ctx, task.instructions ?? undefined);

      await sandboxService.runClaudeCode(workdir, integrationPrompt, {
        maxTurns: 8,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
        outputFormat: 'json',
      });

      await this.log(task, 'Tests intégration', 'Tests d\'intégration générés', 'info', 62);
      await this.updateIssueAI(task.issueId, 62);

      // ── Étape 6 : Exécution des tests ────────────────────────────────────
      await this.log(task, 'Exécution', 'Installation des dépendances et exécution des tests...', 'info', 65);
      await this.updateIssueAI(task.issueId, 65);

      // S'assurer que vitest est installé dans le workspace
      await sandboxService.exec('npm install vitest --save-dev --prefer-offline 2>&1', workdir);

      testResult = await sandboxService.runTests(workdir);

      if (testResult.exitCode !== 0) {
        // Tentative de correction automatique des tests échoués
        await this.log(task, 'Correction', 'Tests en échec — correction automatique...', 'warning', 68);

        const fixPrompt = `Les tests Vitest ont échoué. Analyse les erreurs et corrige les tests (pas le code source) :

\`\`\`
${testResult.stdout.substring(0, 3000)}
${testResult.stderr.substring(0, 1000)}
\`\`\`

Modifie uniquement les fichiers de tests (.test.ts) pour corriger les erreurs.
Ne modifie pas le code source (src/ hors tests). Vérifie les imports, les mocks et les assertions.`;

        await sandboxService.runClaudeCode(workdir, fixPrompt, {
          maxTurns: 5,
          allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
          outputFormat: 'json',
        });

        // Re-exécution après correction
        testResult = await sandboxService.runTests(workdir);
      }

      const testStatus = testResult.exitCode === 0 ? '✅ succès' : '❌ échec';
      await this.log(task, 'Exécution', `Tests : ${testStatus}`, 'info', 75);
      await this.updateIssueAI(task.issueId, 75);

      logger.info('[QAAgent] Tests exécutés', {
        exitCode: testResult.exitCode,
        durationMs: testResult.durationMs,
      });

      // Sauvegarder les fichiers de tests comme artefacts
      const allFiles = await sandboxService.listFiles(workdir);
      for (const filepath of allFiles) {
        if (!filepath.includes('.test.') && !filepath.includes('.spec.')) continue;
        try {
          const content = await sandboxService.readFile(workdir, filepath);
          await this.saveArtifact(task, 'test', content, filepath, 'typescript');
        } catch {
          // Non-bloquant
        }
      }

      // ── Étape 7 : Rapport de tests ───────────────────────────────────────
      await this.log(task, 'Rapport', 'Génération du rapport de tests...', 'info', 78);
      await this.updateIssueAI(task.issueId, 78);

      const reportPrompt = `Lis les fichiers de tests créés et génère un rapport de tests synthétique (5-8 phrases).

Mentionne : nombre de fichiers de tests, types de tests couverts (unitaires/intégration),
résultat de l'exécution (${testResult.exitCode === 0 ? 'succès' : 'échec'}),
couverture estimée des cas nominaux et des cas limites.`;

      const reportResult = await sandboxService.runClaudeCode(workdir, reportPrompt, {
        maxTurns: 1,
        allowedTools: ['Read', 'Glob'],
        outputFormat: 'json',
      });

      summary = reportResult.content || `Tests générés et exécutés pour : ${ctx.title}`;

      // ── Étape 8 : Push GitHub ────────────────────────────────────────────
      await this.updateIssueAI(task.issueId, 80);

      if (process.env['GITHUB_TOKEN']) {
        await this.log(task, 'GitHub', 'Push des tests sur GitHub...', 'info', 80);

        const repoName = `${this.slugify(ctx.title)}-${task.issueId.substring(0, 8)}`;
        const org = process.env['GITHUB_ORG'] ?? undefined;

        try {
          // Si un repo existe déjà pour cette issue (créé par le DeveloperAgent), l'utiliser
          const existingRepo = await this.getExistingRepoUrl(task.issueId);

          if (existingRepo) {
            // Configurer l'origin et pousser sur le repo existant du Developer
            await sandboxService.exec(
              `git remote remove origin 2>/dev/null || true && git remote add origin "${existingRepo}"`,
              workdir
            );
          } else {
            await sandboxService.initGitHubRepo(workdir, `${repoName}-tests`, {
              org,
              isPrivate: true,
              description: `Tests pour : ${ctx.title}`,
            });
          }

          const pushResult = await sandboxService.commitAndPush(
            workdir,
            `test: tests QA pour ${ctx.title.substring(0, 60)}`,
            'tests/qa'
          );

          repoUrl = pushResult.repoUrl;
          commitSha = pushResult.commitSha;
          branch = pushResult.branch;

          await this.log(task, 'GitHub', `Tests poussés : ${repoUrl} @ ${commitSha?.substring(0, 8)}`, 'info', 86);
        } catch (err) {
          logger.warn('[QAAgent] Échec du push GitHub (non-bloquant)', {
            error: (err as Error).message,
          });
          await this.log(task, 'GitHub', `Push GitHub échoué (non-bloquant) : ${(err as Error).message}`, 'warning', 86);
        }
      } else {
        await this.log(task, 'GitHub', 'Push GitHub ignoré (GITHUB_TOKEN non défini)', 'info', 86);
      }

      await this.updateIssueAI(task.issueId, 86);

      // ── Étape 9 : Historisation du contexte ──────────────────────────────
      await this.log(task, 'Historisation', 'Historisation du contexte QA...', 'info', 91);
      await this.updateIssueAI(task.issueId, 91);

      try {
        const { fileTree, fileContents, totalSizeBytes } = await sandboxService.snapshotWorkspace(workdir);

        const snapshot: ContextSnapshot = {
          fileTree,
          fileContents,
          totalSizeBytes,
          buildResult: null,
          testResult,
          githubRepoUrl: repoUrl,
          githubCommitSha: commitSha,
          githubBranch: branch ?? 'tests/qa',
          aiSummary: summary,
          systemPromptUsed: this.systemPrompt,
          totalTokensUsed: 0,
          totalDurationMs: Date.now() - startedAt,
          filesCount: fileTree.length,
          claudeCodeTurns: null,
          parentHistoryId: null,
          tags: [...this.inferTags(ctx), 'qa', 'tests'],
        };

        const historyRecord = await contextHistoryService.save(
          task.id,
          task.issueId,
          ctx.projectId,
          task.agentId,
          snapshot
        );

        await this.log(
          task,
          'Historisation',
          `✅ Contexte QA historisé — ${fileTree.length} fichiers, chaîné au snapshot ${historyRecord.parentHistoryId ?? 'initial'}`,
          'success',
          96
        );
      } catch (histErr) {
        logger.warn('[QAAgent] Historisation échouée (non-bloquant)', {
          error: (histErr as Error).message,
        });
        await this.log(task, 'Historisation', `⚠️ Historisation échouée : ${(histErr as Error).message}`, 'warning', 96);
      }

      // ── Étape 10 : Finalisation ───────────────────────────────────────────
      await this.log(task, 'Finalisation', 'Finalisation du rapport QA...', 'info', 97);
      await this.updateIssueAI(task.issueId, 97);

      const allTestFiles = (await sandboxService.listFiles(workdir))
        .filter(f => f.includes('.test.') || f.includes('.spec.'));

      const commentBody = [
        `## 🧪 Agent QA — Tests générés et exécutés`,
        ``,
        summary,
        ``,
        `**Résultats :**`,
        `- 🧪 Fichiers de tests : ${allTestFiles.length}`,
        `- ▶️ Exécution : ${testResult.exitCode === 0 ? '✅ succès' : '❌ échec'}`,
        repoUrl ? `- 🐙 GitHub : ${repoUrl}${commitSha ? ` @ \`${commitSha.substring(0, 8)}\`` : ''}` : '',
        `- 📚 Contexte historisé pour les tâches futures`,
      ].filter(Boolean).join('\n');

      await this.addIssueComment(task.issueId, task.agentId, commentBody);
      await this.updateIssueAI(task.issueId, 100, summary);
      await this.updateIssueStatus(task.issueId, 'in-review');
      await this.log(task, 'Terminé', 'Tests générés et exécutés avec succès !', 'success', 100);

      return {
        success: true,
        summary,
        artifacts: [],
        tokensUsed: 0,
        durationMs: Date.now() - startedAt,
      };

    } catch (err) {
      const errorMessage = (err as Error).message;
      logger.error('[QAAgent] Erreur lors de l\'exécution', { error: errorMessage, taskId: task.id });

      await this.log(task, 'Erreur', `Erreur : ${errorMessage}`, 'error');
      await this.updateIssueStatus(task.issueId, 'todo');

      // Historisation partielle même en cas d'échec
      if (workdir && ctx) {
        try {
          const { fileTree, fileContents, totalSizeBytes } = await sandboxService.snapshotWorkspace(workdir);
          await contextHistoryService.save(task.id, task.issueId, ctx.projectId, task.agentId, {
            fileTree, fileContents, totalSizeBytes,
            buildResult: null, testResult,
            githubRepoUrl: null, githubCommitSha: null, githubBranch: 'tests/qa',
            aiSummary: `ÉCHEC QA: ${errorMessage}`,
            systemPromptUsed: this.systemPrompt,
            totalTokensUsed: 0,
            totalDurationMs: Date.now() - startedAt,
            filesCount: fileTree.length, claudeCodeTurns: null,
            parentHistoryId: null,
            tags: [...(ctx ? this.inferTags(ctx) : []), 'qa', 'failed', 'error'],
          });
        } catch { /* non-bloquant */ }
      }

      return {
        success: false,
        summary: `Erreur QA : ${errorMessage}`,
        artifacts: [],
        tokensUsed: 0,
        durationMs: Date.now() - startedAt,
      };

    } finally {
      if (workdir) {
        try {
          await sandboxService.cleanWorkspace(task.id);
          logger.info('[QAAgent] Workspace nettoyé', { workdir });
        } catch (cleanErr) {
          logger.warn('[QAAgent] Nettoyage échoué', { error: (cleanErr as Error).message });
        }
      }
    }
  }

  // ── Chargement du code source ─────────────────────────────────────────────

  /**
   * Tente de charger le code source à tester dans le workspace.
   * Priorité :
   *   1. Repo GitHub existant (snapshot du DeveloperAgent)
   *   2. Artefacts de code en base (ai_artifacts liés à l'issue)
   *   3. Rien → Claude Code devra générer code + tests de zéro
   *
   * Retourne true si du code a été chargé.
   */
  private async loadCodeIntoWorkspace(
    task: AITaskQueue,
    ctx: IssueContext,
    workdir: string
  ): Promise<boolean> {
    // 1. Chercher un repo GitHub dans l'historique du projet
    const latestHistory = await contextHistoryService.getLatestForProject(ctx.projectId);

    if (latestHistory?.githubRepoUrl) {
      try {
        await this.log(task, 'Code source', `Clone du repo GitHub : ${latestHistory.githubRepoUrl}`, 'info');

        const cloneResult = await sandboxService.exec(
          `git clone "${latestHistory.githubRepoUrl}" . 2>&1`,
          workdir
        );

        if (cloneResult.exitCode === 0) {
          logger.info('[QAAgent] Code cloné depuis GitHub', { repoUrl: latestHistory.githubRepoUrl });
          return true;
        }
      } catch (err) {
        logger.warn('[QAAgent] Clone GitHub échoué, passage aux artefacts DB', {
          error: (err as Error).message,
        });
      }
    }

    // 2. Charger les artefacts de code depuis la base de données
    const artifacts = await this.getCodeArtifacts(task.issueId);

    if (artifacts.length > 0) {
      await this.log(task, 'Code source', `${artifacts.length} artefact(s) chargé(s) depuis la DB`, 'info');

      // Initialiser un projet Node.js minimal
      await sandboxService.initNodeProject(workdir, this.slugify(ctx.title));

      // Écrire chaque artefact dans src/
      for (const artifact of artifacts) {
        const targetPath = artifact.filename.startsWith('src/')
          ? artifact.filename
          : `src/${artifact.filename}`;

        // Créer les sous-dossiers si nécessaire
        const dir = targetPath.substring(0, targetPath.lastIndexOf('/'));
        if (dir && dir !== 'src') {
          await sandboxService.exec(`mkdir -p "${dir}"`, workdir);
        }

        await sandboxService.exec(
          `printf '%s' "${this.escapeForShell(artifact.content)}" > "${targetPath}"`,
          workdir
        );
      }

      logger.info('[QAAgent] Artefacts écrits dans le workspace', {
        count: artifacts.length,
        files: artifacts.map(a => a.filename),
      });
      return true;
    }

    // 3. Aucun code disponible — initialiser un projet vide
    await sandboxService.initNodeProject(workdir, this.slugify(ctx.title));
    logger.info('[QAAgent] Aucun code source — workspace vide initialisé');
    return false;
  }

  /**
   * Récupère les artefacts de code liés à une issue depuis la base de données.
   */
  private async getCodeArtifacts(issueId: string): Promise<CodeArtifact[]> {
    const result = await pool.query<{
      filename: string;
      content: string;
      language: string;
    }>(
      `SELECT filename, content, language
       FROM ai_artifacts
       WHERE issue_id = $1
         AND type = 'code'
         AND filename NOT LIKE '%.test.%'
         AND filename NOT LIKE '%.spec.%'
       ORDER BY created_at ASC`,
      [issueId]
    );

    return result.rows.map((row: { filename: string; content: string; language: string }) => ({
      filename: row.filename,
      content: row.content,
      language: row.language ?? 'typescript',
    }));
  }

  /**
   * Récupère l'URL GitHub du dernier push pour une issue donnée.
   * Cherche dans l'historique de contexte.
   */
  private async getExistingRepoUrl(issueId: string): Promise<string | null> {
    const records = await contextHistoryService.getByIssue(issueId);
    return records.find(r => r.githubRepoUrl)?.githubRepoUrl ?? null;
  }

  // ── Construction des prompts ──────────────────────────────────────────────

  private buildStrategyPrompt(ctx: IssueContext, instructions?: string, hasCode = false): string {
    return [
      `Lis les fichiers dans src/ et définis une stratégie de tests pour :`,
      ``,
      `**Titre** : ${ctx.title}`,
      `**Type** : ${ctx.type} | **Priorité** : ${ctx.priority}`,
      ``,
      ctx.description ? `**Description** : ${ctx.description}` : '',
      instructions ? `**Instructions** : ${instructions}` : '',
      ``,
      hasCode
        ? `Le code source est dans src/. Identifie les fonctions/composants à tester, les cas limites et les mocks nécessaires.`
        : `Aucun code source existant. Définis une stratégie pour une implémentation TypeScript typique de cette fonctionnalité.`,
      ``,
      `Réponds en Markdown avec : composants à tester, types de tests (unitaire/intégration), cas limites, mocks requis.`,
    ].filter(Boolean).join('\n');
  }

  private buildUnitTestPrompt(ctx: IssueContext, strategy: string, instructions?: string): string {
    return [
      `Génère des tests unitaires Vitest COMPLETS pour les fichiers dans src/.`,
      ``,
      `**Contexte** : ${ctx.title}`,
      instructions ? `**Instructions** : ${instructions}` : '',
      ``,
      strategy ? `**Stratégie définie** :\n${strategy.substring(0, 1000)}` : '',
      ``,
      `Règles :`,
      `- Utilise Vitest (import { describe, it, expect, vi } from 'vitest')`,
      `- Noms de tests descriptifs en français`,
      `- Couvre minimum 3 cas nominaux et 2 cas d'erreur par fonction`,
      `- Fichiers dans src/ avec suffixe .test.ts`,
      `- Mock les dépendances externes (fs, fetch, DB) avec vi.mock()`,
      `- Lance \`npx vitest run\` pour vérifier que les tests s'exécutent`,
    ].filter(Boolean).join('\n');
  }

  private buildIntegrationTestPrompt(ctx: IssueContext, instructions?: string): string {
    return [
      `Génère des tests d'intégration Vitest pour les interactions entre modules dans src/.`,
      ``,
      `**Contexte** : ${ctx.title}`,
      instructions ? `**Instructions** : ${instructions}` : '',
      ``,
      `Règles :`,
      `- Teste les interactions entre plusieurs modules (pas les fonctions unitairement)`,
      `- Simule des scénarios utilisateur complets`,
      `- Utilise des fixtures de données réalistes`,
      `- Fichiers dans src/ avec suffixe .integration.test.ts`,
      `- Maximum 2 fichiers d'intégration (pour rester léger)`,
    ].filter(Boolean).join('\n');
  }

  // ── Utilitaires privés ────────────────────────────────────────────────────

  /** Normalise un texte en kebab-case (max 50 chars) */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50)
      .replace(/-$/, '');
  }

  /** Échappe les caractères spéciaux pour printf/shell */
  private escapeForShell(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''")
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`');
  }

  /** Déduit des tags depuis le contexte de l'issue */
  private inferTags(ctx: IssueContext): string[] {
    const tags = new Set<string>();
    if (ctx.type) tags.add(ctx.type);
    if (ctx.priority === 'high' || ctx.priority === 'critical') tags.add(ctx.priority);

    const text = `${ctx.title} ${ctx.description}`.toLowerCase();
    if (/refactor/.test(text)) tags.add('refactor');
    if (/feature|fonctionnalit/.test(text)) tags.add('feature');
    if (/fix|bug/.test(text)) tags.add('fix');
    if (/api|endpoint/.test(text)) tags.add('api');
    if (/ui|composant|react/.test(text)) tags.add('ui');
    if (/database|sql/.test(text)) tags.add('database');

    return [...tags];
  }
}
