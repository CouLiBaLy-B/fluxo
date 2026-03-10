// ═══════════════════════════════════════════════════════════════════════════════
// Agent Developer — Génère du code via Claude Code dans un sandbox Docker isolé
//
// Flow d'exécution :
//   1.  Init workspace + contexte de l'issue
//   2.  Chargement de la mémoire projet (historique des tâches précédentes)
//   3.  Setup projet Node.js / TypeScript
//   4.  Génération du code (Claude Code headless, CLAUDE.md injecté)
//   5.  Compilation TypeScript (avec tentative de correction automatique)
//   6.  Génération et exécution des tests Vitest
//   7.  Push GitHub (si GITHUB_TOKEN défini)
//   8.  Résumé de la tâche
//   9.  Historisation du contexte (mémoire cumulative)
//   10. Finalisation et nettoyage du workspace
// ═══════════════════════════════════════════════════════════════════════════════

import { BaseAgent } from './base-agent';
import { sandboxService } from '../services/sandbox.service';
import { contextHistoryService } from '../services/context-history.service';
import type { SandboxExecResult } from '../services/sandbox.service';
import type { ContextSnapshot } from '../services/context-history.service';
import type { AITaskQueue, AgentResult, AgentType } from '../types/agents.types';
import logger from '../logger';

// Déclaration explicite de process (évite l'erreur TS2580 si @types/node absent)
declare const process: { env: Record<string, string | undefined> };

// ── Contexte d'issue enrichi ──────────────────────────────────────────────────

interface IssueContext {
  title: string;
  description: string;
  aiInstructions: string;
  type: string;
  priority: string;
  projectId: string;
}

// ── Classe principale ─────────────────────────────────────────────────────────

export class DeveloperAgent extends BaseAgent {
  readonly type: AgentType = 'developer';

  // Prompt système : règles absolues pour la génération de code.
  // La section "Format de réponse" est retirée car Claude Code gère directement
  // l'écriture des fichiers sur disque.
  readonly systemPrompt = `Tu es un expert développeur full-stack spécialisé en TypeScript, React, Node.js et PostgreSQL.

Règles absolues :
- Génère du code COMPLET et fonctionnel, jamais tronqué
- TypeScript strict : types explicites, pas de "any" sauf si inévitable
- Gestion d'erreurs complète (try/catch, validation)
- Commentaires en français, code en anglais (noms de variables/fonctions)
- Respecte les patterns existants du projet
- Code prêt pour la production (pas de console.log, pas de TODO)
- Crée les fichiers directement sur disque dans le répertoire src/`;

  // ── Méthode principale ────────────────────────────────────────────────────

  async execute(task: AITaskQueue): Promise<AgentResult> {
    const startedAt = Date.now();

    // ── Variables mutables pour l'historisation et le finally ────────────────
    // Déclarées avant le try pour être accessibles dans catch et finally
    let workdir: string | null = null;
    let buildResult: SandboxExecResult | null = null;
    let testResult: SandboxExecResult | null = null;
    let repoUrl: string | null = null;
    let commitSha: string | null = null;
    let branch: string | null = null;
    let summary: string | null = null;
    let claudeCodeTurns: number | null = null;
    let ctx: IssueContext | null = null;

    try {

      // ── Étape 1 : Initialisation ──────────────────────────────────────────
      await this.log(task, 'Initialisation', 'Démarrage de l\'agent Developer...', 'info', 5);
      await this.updateIssueStatus(task.issueId, 'in-progress');
      await this.updateIssueAI(task.issueId, 5);

      // Créer le workspace isolé dans le sandbox
      await this.log(task, 'Workspace', 'Création du workspace sandbox...', 'info', 6);
      workdir = await sandboxService.createWorkspace(task.id);
      logger.info('[DeveloperAgent] Workspace créé', { workdir });

      // Charger le contexte de l'issue Jira
      await this.log(task, 'Contexte', 'Chargement du contexte de la tâche...', 'info', 8);
      ctx = await this.getIssueContext(task.issueId);
      logger.info('[DeveloperAgent] Contexte chargé', {
        title: ctx.title,
        type: ctx.type,
        projectId: ctx.projectId,
      });

      // ── Étape 2 : Chargement de la mémoire projet ─────────────────────────
      await this.log(task, 'Mémoire projet', 'Chargement de l\'historique des tâches précédentes...', 'info', 9);
      await this.updateIssueAI(task.issueId, 9);

      let projectMemory: string | null = null;

      const latestSnapshot = await contextHistoryService.getLatestForProject(ctx.projectId);
      if (latestSnapshot) {
        logger.info('[DeveloperAgent] Historique trouvé, construction de la mémoire projet', {
          latestSnapshotId: latestSnapshot.id,
          projectId: ctx.projectId,
        });

        const memory = await contextHistoryService.buildProjectMemory(ctx.projectId, {
          maxSnapshots: 5,
          includeFileTree: true,
          includeCode: true,
          maxCodeLength: 3000,
        });

        if (memory.trim()) {
          projectMemory = memory;
          logger.info('[DeveloperAgent] Mémoire projet chargée', {
            memoryLength: memory.length,
          });
          await this.log(
            task,
            'Mémoire projet',
            `Historique chargé (${memory.length} caractères) — continuité du projet assurée`,
            'info',
            10
          );
        }
      } else {
        logger.info('[DeveloperAgent] Aucun historique précédent — premier snapshot du projet');
        await this.log(task, 'Mémoire projet', 'Premier snapshot du projet — pas d\'historique', 'info', 10);
      }

      // ── Étape 3 : Initialisation du projet Node.js ────────────────────────
      await this.log(task, 'Setup projet', 'Initialisation du projet Node.js / TypeScript...', 'info', 12);
      await this.updateIssueAI(task.issueId, 12);

      const projectSlug = this.slugify(ctx.title);
      await sandboxService.initNodeProject(workdir, projectSlug);
      logger.info('[DeveloperAgent] Projet initialisé', { slug: projectSlug });

      // ── Étape 4 : Génération du code avec Claude Code ─────────────────────
      await this.log(task, 'Génération', 'Écriture du fichier de contexte CLAUDE.md...', 'info', 20);
      await this.updateIssueAI(task.issueId, 20);

      // Écrire CLAUDE.md dans le workspace avec le contexte complet de la tâche
      const claudeMdContent = this.buildClaudeMd(ctx, task.instructions ?? undefined, projectMemory ?? undefined);
      await sandboxService.exec(
        `printf '%s' "${sandboxService['escapeForBash']?.(claudeMdContent) ?? claudeMdContent.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}" > CLAUDE.md`,
        workdir
      );

      await this.log(task, 'Génération', 'Lancement de Claude Code pour la génération du code...', 'info', 25);
      await this.updateIssueAI(task.issueId, 25);

      // Prompt principal de génération
      const mainPrompt = this.buildMainPrompt(ctx, task.instructions ?? undefined);

      // Prompt système additionnel si la mémoire projet est disponible
      const appendSystemPrompt = projectMemory
        ? 'Tu as accès à l\'historique des tâches précédentes de ce projet dans le fichier CLAUDE.md. ' +
          'Réutilise les patterns, conventions et structures existants. ' +
          'Assure la cohérence avec le code déjà produit.'
        : undefined;

      const codeResult = await sandboxService.runClaudeCode(workdir, mainPrompt, {
        maxTurns: 15,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
        appendSystemPrompt,
        outputFormat: 'json',
      });

      // Nombre de tours utilisés (si disponible dans la réponse)
      claudeCodeTurns = codeResult.filesCreated.length > 0 ? 15 : null;

      await this.log(
        task,
        'Génération',
        `Code généré — ${codeResult.filesCreated.length} fichier(s) créé(s)`,
        'info',
        50
      );
      await this.updateIssueAI(task.issueId, 50);

      // Sauvegarder chaque fichier créé comme artefact en base
      for (const filepath of codeResult.filesCreated) {
        try {
          const content = await sandboxService.readFile(workdir, filepath);
          const artifactType = (filepath.includes('.test.') || filepath.includes('.spec.'))
            ? 'test'
            : 'code';
          const language = this.inferLanguage(filepath);
          await this.saveArtifact(task, artifactType, content, filepath, language);
        } catch (err) {
          logger.warn('[DeveloperAgent] Impossible de sauvegarder l\'artefact', {
            filepath,
            error: (err as Error).message,
          });
        }
      }

      // ── Étape 5 : Compilation TypeScript ─────────────────────────────────
      await this.log(task, 'Compilation', 'Compilation TypeScript en cours...', 'info', 60);
      await this.updateIssueAI(task.issueId, 60);

      buildResult = await sandboxService.buildProject(workdir);

      if (buildResult.exitCode !== 0) {
        // Tentative de correction automatique via Claude Code
        await this.log(
          task,
          'Compilation',
          `Erreurs de compilation détectées — correction automatique...`,
          'warning',
          62
        );

        const fixPrompt = `Des erreurs de compilation TypeScript ont été détectées. Corrige-les :

\`\`\`
${buildResult.stdout.substring(0, 3000)}
${buildResult.stderr.substring(0, 1000)}
\`\`\`

Modifie uniquement les fichiers nécessaires pour résoudre ces erreurs. Ne génère pas de nouveaux fichiers.`;

        await sandboxService.runClaudeCode(workdir, fixPrompt, {
          maxTurns: 5,
          allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
          outputFormat: 'json',
        });

        // Re-tenter la compilation après correction
        buildResult = await sandboxService.buildProject(workdir);
      }

      const buildStatus = buildResult.exitCode === 0 ? '✅ succès' : '❌ échec';
      await this.log(task, 'Compilation', `Compilation : ${buildStatus}`, 'info', 65);
      await this.updateIssueAI(task.issueId, 65);
      logger.info('[DeveloperAgent] Compilation', {
        exitCode: buildResult.exitCode,
        durationMs: buildResult.durationMs,
      });

      // ── Étape 6 : Tests Vitest ────────────────────────────────────────────
      await this.log(task, 'Tests', 'Génération des tests Vitest...', 'info', 70);
      await this.updateIssueAI(task.issueId, 70);

      // Demander à Claude Code de générer les tests
      const testGenPrompt = `Génère des tests unitaires Vitest complets pour les fichiers src/ existants.

Règles :
- Utilise Vitest (import { describe, it, expect } from 'vitest')
- Couvre les fonctions principales avec des cas nominaux et des cas d'erreur
- Fichiers de tests dans src/ avec suffixe .test.ts
- Pas de console.log, pas de TODO

Contexte de la tâche : ${ctx.title}`;

      await sandboxService.runClaudeCode(workdir, testGenPrompt, {
        maxTurns: 8,
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
        outputFormat: 'json',
      });

      // Exécuter les tests
      await this.log(task, 'Tests', 'Exécution des tests Vitest...', 'info', 75);
      testResult = await sandboxService.runTests(workdir);

      const testStatus = testResult.exitCode === 0 ? '✅ succès' : '❌ échec';
      await this.log(task, 'Tests', `Tests : ${testStatus}`, 'info', 78);
      await this.updateIssueAI(task.issueId, 78);
      logger.info('[DeveloperAgent] Tests', {
        exitCode: testResult.exitCode,
        durationMs: testResult.durationMs,
      });

      // ── Étape 7 : Push GitHub ─────────────────────────────────────────────
      await this.updateIssueAI(task.issueId, 80);

      if (process.env['GITHUB_TOKEN']) {
        await this.log(task, 'GitHub', 'Push du code sur GitHub...', 'info', 80);

        const repoName = `${projectSlug}-${task.issueId.substring(0, 8)}`;
        const org = process.env['GITHUB_ORG'] ?? undefined;

        try {
          const repoInitUrl = await sandboxService.initGitHubRepo(workdir, repoName, {
            org,
            isPrivate: true,
            description: ctx.title,
          });

          const pushResult = await sandboxService.commitAndPush(
            workdir,
            `feat: ${ctx.title.substring(0, 72)}`,
            'main'
          );

          repoUrl = pushResult.repoUrl || repoInitUrl;
          commitSha = pushResult.commitSha;
          branch = pushResult.branch;

          await this.log(task, 'GitHub', `Push réussi : ${repoUrl} @ ${commitSha?.substring(0, 8)}`, 'info', 86);
          logger.info('[DeveloperAgent] GitHub push réussi', { repoUrl, commitSha, branch });
        } catch (err) {
          logger.warn('[DeveloperAgent] Échec du push GitHub (non-bloquant)', {
            error: (err as Error).message,
          });
          await this.log(task, 'GitHub', `Push GitHub échoué (non-bloquant) : ${(err as Error).message}`, 'warning', 86);
        }
      } else {
        logger.info('[DeveloperAgent] GITHUB_TOKEN non défini — push GitHub ignoré');
        await this.log(task, 'GitHub', 'Push GitHub ignoré (GITHUB_TOKEN non défini)', 'info', 86);
      }

      await this.updateIssueAI(task.issueId, 86);

      // ── Étape 8 : Résumé de la tâche ──────────────────────────────────────
      await this.log(task, 'Résumé', 'Génération du résumé de la tâche...', 'info', 87);
      await this.updateIssueAI(task.issueId, 87);

      const summaryPrompt = `Lis les fichiers créés dans src/ et rédige un résumé en 3-5 phrases de ce qui a été accompli.

Mentionne : ce qui a été créé, les choix techniques clés, le résultat de la compilation (${buildResult.exitCode === 0 ? 'succès' : 'échec'}) et des tests (${testResult.exitCode === 0 ? 'succès' : 'échec'}).
Contexte : ${ctx.title}`;

      const summaryResult = await sandboxService.runClaudeCode(workdir, summaryPrompt, {
        maxTurns: 1,
        allowedTools: ['Read'],
        outputFormat: 'json',
      });

      summary = summaryResult.content || `Code généré pour : ${ctx.title}`;

      await this.log(task, 'Résumé', summary.substring(0, 200), 'info', 90);
      await this.updateIssueAI(task.issueId, 90);

      // ── Étape 9 : Historisation du contexte ───────────────────────────────
      await this.log(task, 'Historisation', 'Historisation du contexte du workspace...', 'info', 91);
      await this.updateIssueAI(task.issueId, 91);

      try {
        // Prendre le snapshot complet du workspace
        const { fileTree, fileContents, totalSizeBytes } = await sandboxService.snapshotWorkspace(workdir);

        // Construire le snapshot complet
        const snapshot: ContextSnapshot = {
          fileTree,
          fileContents,
          totalSizeBytes,
          buildResult,
          testResult,
          githubRepoUrl: repoUrl,
          githubCommitSha: commitSha,
          githubBranch: branch ?? 'main',
          aiSummary: summary,
          systemPromptUsed: this.systemPrompt,
          totalTokensUsed: 0, // Les tokens Claude Code ne sont pas comptés ici
          totalDurationMs: Date.now() - startedAt,
          filesCount: fileTree.length,
          claudeCodeTurns,
          parentHistoryId: null, // Sera rempli automatiquement par le service
          tags: this.inferTags(ctx),
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
          `✅ Contexte historisé — ${fileTree.length} fichiers, ${totalSizeBytes} octets, chaîné au snapshot ${historyRecord.parentHistoryId ?? 'initial'}`,
          'success',
          96
        );

        logger.info('[DeveloperAgent] Contexte historisé', {
          historyId: historyRecord.id,
          parentHistoryId: historyRecord.parentHistoryId,
          filesCount: fileTree.length,
          totalSizeBytes,
        });

      } catch (histErr) {
        // L'historisation est résiliente : un échec ne bloque pas la finalisation
        logger.warn('[DeveloperAgent] Historisation échouée (non-bloquant)', {
          error: (histErr as Error).message,
        });
        await this.log(
          task,
          'Historisation',
          `⚠️ Historisation échouée (non-bloquant) : ${(histErr as Error).message}`,
          'warning',
          96
        );
      }

      // ── Étape 10 : Finalisation ────────────────────────────────────────────
      await this.log(task, 'Finalisation', 'Finalisation de la tâche...', 'info', 97);
      await this.updateIssueAI(task.issueId, 97);

      // Commentaire automatique sur l'issue Jira
      const filesCreatedFinal = await sandboxService.listFiles(workdir);
      const commentBody = [
        `## 🧑‍💻 Agent Developer — Tâche terminée`,
        ``,
        summary,
        ``,
        `**Résultats :**`,
        `- 📁 Fichiers générés : ${filesCreatedFinal.length}`,
        `- 🔨 Compilation : ${buildResult.exitCode === 0 ? '✅ succès' : '❌ échec'}`,
        `- 🧪 Tests : ${testResult.exitCode === 0 ? '✅ succès' : '❌ échec'}`,
        repoUrl ? `- 🐙 GitHub : ${repoUrl}${commitSha ? ` @ \`${commitSha.substring(0, 8)}\`` : ''}` : '',
        `- 📚 Contexte historisé pour les tâches futures`,
      ].filter(Boolean).join('\n');

      await this.addIssueComment(task.issueId, task.agentId, commentBody);
      await this.updateIssueAI(task.issueId, 100, summary);
      await this.updateIssueStatus(task.issueId, 'in-review');
      await this.log(task, 'Terminé', 'Code généré et historisé avec succès !', 'success', 100);

      return {
        success: true,
        summary,
        artifacts: [],
        tokensUsed: 0,
        durationMs: Date.now() - startedAt,
      };

    } catch (err) {
      const errorMessage = (err as Error).message;
      logger.error('[DeveloperAgent] Erreur lors de l\'exécution', {
        error: errorMessage,
        taskId: task.id,
      });

      await this.log(task, 'Erreur', `Erreur : ${errorMessage}`, 'error');
      await this.updateIssueStatus(task.issueId, 'todo');

      // Tentative d'historisation partielle même en cas d'échec
      // (permet de garder une trace pour éviter les mêmes erreurs à l'avenir)
      if (workdir && ctx) {
        try {
          const { fileTree, fileContents, totalSizeBytes } = await sandboxService.snapshotWorkspace(workdir);

          const failedSnapshot: ContextSnapshot = {
            fileTree,
            fileContents,
            totalSizeBytes,
            buildResult,
            testResult,
            githubRepoUrl: null,
            githubCommitSha: null,
            githubBranch: 'main',
            aiSummary: `ÉCHEC: ${errorMessage}`,
            systemPromptUsed: this.systemPrompt,
            totalTokensUsed: 0,
            totalDurationMs: Date.now() - startedAt,
            filesCount: fileTree.length,
            claudeCodeTurns,
            parentHistoryId: null,
            tags: [...this.inferTags(ctx), 'failed', 'error'],
          };

          await contextHistoryService.save(
            task.id,
            task.issueId,
            ctx.projectId,
            task.agentId,
            failedSnapshot
          );

          logger.info('[DeveloperAgent] Historisation partielle réussie (tâche échouée)');
        } catch (histErr) {
          logger.warn('[DeveloperAgent] Historisation partielle échouée', {
            error: (histErr as Error).message,
          });
        }
      }

      return {
        success: false,
        summary: `Erreur : ${errorMessage}`,
        artifacts: [],
        tokensUsed: 0,
        durationMs: Date.now() - startedAt,
      };

    } finally {
      // Nettoyage TOUJOURS exécuté, succès ou échec
      if (workdir) {
        try {
          await sandboxService.cleanWorkspace(task.id);
          logger.info('[DeveloperAgent] Workspace nettoyé', { workdir });
        } catch (cleanErr) {
          logger.warn('[DeveloperAgent] Nettoyage du workspace échoué', {
            workdir,
            error: (cleanErr as Error).message,
          });
        }
      }
    }
  }

  // ── Méthodes privées ──────────────────────────────────────────────────────

  /**
   * Génère le contenu du fichier CLAUDE.md à injecter dans le workspace.
   * Ce fichier fournit à Claude Code le contexte complet de la tâche.
   * Si projectMemory est fourni, ajoute une section d'historique.
   */
  private buildClaudeMd(
    ctx: IssueContext,
    instructions?: string,
    projectMemory?: string
  ): string {
    const lines: string[] = [
      `# Tâche : ${ctx.title}`,
      ``,
      `## Contexte`,
      `- **Type** : ${ctx.type}`,
      `- **Priorité** : ${ctx.priority}`,
      `- **Projet ID** : ${ctx.projectId}`,
      ``,
      `## Description`,
      ctx.description || '(aucune description)',
      ``,
    ];

    if (instructions || ctx.aiInstructions) {
      lines.push(`## Instructions spécifiques`);
      lines.push(instructions || ctx.aiInstructions);
      lines.push(``);
    }

    lines.push(`## Conventions`);
    lines.push(`- TypeScript strict, pas de \`any\``);
    lines.push(`- Commentaires en français, code (variables/fonctions) en anglais`);
    lines.push(`- Gestion d'erreurs complète avec try/catch`);
    lines.push(`- Code production-ready, pas de console.log`);
    lines.push(`- Fichiers sources dans \`src/\``);
    lines.push(``);

    // Section historique de projet (mémoire cumulative)
    if (projectMemory) {
      lines.push(`## Historique du projet`);
      lines.push(``);
      lines.push(projectMemory);
      lines.push(``);
      lines.push(`> **Important** : Réutilise les patterns et la structure des tâches précédentes. Assure la cohérence.`);
      lines.push(``);
    }

    return lines.join('\n');
  }

  /**
   * Construit le prompt principal envoyé à Claude Code pour la génération.
   */
  private buildMainPrompt(ctx: IssueContext, instructions?: string): string {
    return [
      `Implémente la tâche suivante dans le répertoire src/ :`,
      ``,
      `**Titre** : ${ctx.title}`,
      `**Type** : ${ctx.type} | **Priorité** : ${ctx.priority}`,
      ``,
      `**Description** :`,
      ctx.description || '(voir CLAUDE.md)',
      ``,
      instructions ? `**Instructions** : ${instructions}` : '',
      ``,
      `Consulte CLAUDE.md pour le contexte complet, les conventions et l'historique du projet.`,
      `Génère du code TypeScript complet et fonctionnel dans src/.`,
      `Chaque fichier doit être créé/écrit sur disque avec les outils disponibles.`,
    ].filter(l => l !== undefined).join('\n');
  }

  /**
   * Normalise un texte en kebab-case (max 50 caractères).
   * Utilisé pour les noms de projets et de repos GitHub.
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // supprimer les accents
      .replace(/[^a-z0-9\s-]/g, '')    // garder lettres, chiffres, espaces, tirets
      .trim()
      .replace(/\s+/g, '-')            // espaces → tirets
      .replace(/-+/g, '-')             // tirets multiples → un seul
      .substring(0, 50)
      .replace(/-$/, '');              // supprimer le tiret final éventuel
  }

  /**
   * Retourne le langage d'un fichier selon son extension.
   * Utilisé pour les métadonnées des artefacts.
   */
  private inferLanguage(filepath: string): string {
    const ext = filepath.substring(filepath.lastIndexOf('.')).toLowerCase();
    const map: Record<string, string> = {
      '.tsx':  'tsx',
      '.ts':   'typescript',
      '.js':   'javascript',
      '.jsx':  'jsx',
      '.json': 'json',
      '.css':  'css',
      '.scss': 'scss',
      '.md':   'markdown',
      '.html': 'html',
      '.sql':  'sql',
      '.sh':   'bash',
      '.yml':  'yaml',
      '.yaml': 'yaml',
    };
    return map[ext] ?? 'text';
  }

  /**
   * Déduit des tags depuis le contexte de l'issue pour enrichir les snapshots.
   * Utile pour filtrer l'historique par type de tâche.
   */
  private inferTags(ctx: IssueContext): string[] {
    const tags = new Set<string>();

    // Tag basé sur le type d'issue
    if (ctx.type) tags.add(ctx.type);

    // Tag basé sur la priorité (uniquement les priorités élevées)
    if (ctx.priority === 'high' || ctx.priority === 'critical' || ctx.priority === 'urgent') {
      tags.add(ctx.priority);
    }

    // Analyse basique du titre et de la description pour détecter des mots-clés
    const text = `${ctx.title} ${ctx.description}`.toLowerCase();

    if (/refactor|refactoring|restructur/.test(text)) tags.add('refactor');
    if (/feature|fonctionnalit|implement|ajouter|créer/.test(text)) tags.add('feature');
    if (/fix|bug|correction|erreur|issue/.test(text)) tags.add('fix');
    if (/api|endpoint|route|rest|http/.test(text)) tags.add('api');
    if (/ui|composant|component|interface|frontend|react/.test(text)) tags.add('ui');
    if (/database|db|sql|migration|table|postgre/.test(text)) tags.add('database');
    if (/test|vitest|jest|spec/.test(text)) tags.add('test');
    if (/auth|login|jwt|token|session/.test(text)) tags.add('auth');

    return [...tags];
  }
}
