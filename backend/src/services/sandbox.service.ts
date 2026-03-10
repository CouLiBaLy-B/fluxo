// ═══════════════════════════════════════════════════════════════════════════════
// SandboxService — Interface avec le conteneur Docker sandbox
//
// Ce service permet au backend d'exécuter des commandes dans le conteneur
// atlassian_sandbox via `docker exec`. Il fournit des méthodes haut niveau pour :
//   - Gérer les workspaces de tâches (/workspace/<taskId>)
//   - Exécuter Claude Code en mode headless (claude -p)
//   - Initialiser des projets Node.js / TypeScript
//   - Compiler, tester, et pousser sur GitHub
//   - Prendre un snapshot complet du workspace pour l'historisation
//
// Pré-requis : le socket Docker doit être monté dans le backend
//   /var/run/docker.sock:/var/run/docker.sock:ro  (docker-compose.yml)
// ═══════════════════════════════════════════════════════════════════════════════

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import logger from '../logger';

// Promisification de child_process.exec pour usage async/await
const execAsync = promisify(execCb);

// ── Constantes ────────────────────────────────────────────────────────────────

/** Nom du conteneur sandbox (peut être surchargé via env) */
const SANDBOX_CONTAINER = process.env['SANDBOX_CONTAINER'] ?? 'atlassian_sandbox';

/** Répertoire de base des workspaces dans le sandbox */
const WORKSPACE_BASE = '/workspace';

/** Timeout par défaut pour les exécutions (10 minutes) */
const EXEC_TIMEOUT_MS = 600_000;

/** Taille maximale d'un fichier avant troncature dans les snapshots (100 Ko) */
const MAX_FILE_SIZE_BYTES = 100 * 1024;

/** Extensions de fichiers binaires à exclure des snapshots */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.br',
  '.pdf', '.bin', '.exe', '.dll', '.so',
]);

// ── Interfaces exportées ──────────────────────────────────────────────────────

/** Résultat d'une exécution de commande dans le sandbox */
export interface SandboxExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

/** Résultat d'une session Claude Code */
export interface ClaudeCodeResult {
  content: string;
  filesCreated: string[];
  exitCode: number;
  durationMs: number;
}

/** Résultat d'une opération GitHub */
export interface GitHubRepoResult {
  repoUrl: string;
  commitSha: string;
  branch: string;
}

// ── Options ───────────────────────────────────────────────────────────────────

interface RunClaudeCodeOptions {
  model?: string;
  maxTurns?: number;
  allowedTools?: string[];
  appendSystemPrompt?: string;
  outputFormat?: 'json' | 'text' | 'stream-json';
}

interface InitGitHubRepoOptions {
  org?: string;
  isPrivate?: boolean;
  description?: string;
}

// ── Classe principale ─────────────────────────────────────────────────────────

class SandboxService {

  // ── Méthode utilitaire privée — échappement Bash ───────────────────────────

  /**
   * Échappe les caractères spéciaux pour une injection sécurisée dans une
   * commande bash entre guillemets doubles.
   * Caractères échappés : " $ `
   */
  private escapeForBash(str: string): string {
    return str
      .replace(/\\/g, '\\\\')   // antislash en premier
      .replace(/"/g, '\\"')     // guillemets doubles
      .replace(/\$/g, '\\$')    // variables shell
      .replace(/`/g, '\\`');    // backticks (substitution de commande)
  }

  // ── Exécution de commandes ─────────────────────────────────────────────────

  /**
   * Exécute une commande bash dans le conteneur sandbox via docker exec.
   * Ne throw jamais — retourne exitCode > 0 en cas d'erreur.
   */
  async exec(
    command: string,
    workdir?: string,
    timeoutMs: number = EXEC_TIMEOUT_MS
  ): Promise<SandboxExecResult> {
    const startedAt = Date.now();

    // Construction de la commande docker exec
    const workdirFlag = workdir ? `-w "${workdir}"` : '';
    const dockerCmd = `docker exec ${workdirFlag} ${SANDBOX_CONTAINER} bash -c "${this.escapeForBash(command)}"`;

    logger.debug('[SandboxService] exec', {
      container: SANDBOX_CONTAINER,
      workdir,
      command: command.substring(0, 200), // tronque pour les logs
    });

    try {
      const { stdout, stderr } = await execAsync(dockerCmd, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10 Mo de buffer
      });

      const durationMs = Date.now() - startedAt;
      logger.debug('[SandboxService] exec OK', { durationMs, exitCode: 0 });

      return { stdout, stderr, exitCode: 0, durationMs };

    } catch (err: unknown) {
      const durationMs = Date.now() - startedAt;
      const error = err as { stdout?: string; stderr?: string; code?: number; message?: string };

      // child_process.exec place stdout/stderr dans l'erreur même en cas d'échec
      const stdout = error.stdout ?? '';
      const stderr = error.stderr ?? error.message ?? '';
      const exitCode = error.code ?? 1;

      logger.warn('[SandboxService] exec FAIL', {
        exitCode,
        durationMs,
        stderr: stderr.substring(0, 500),
      });

      return { stdout, stderr, exitCode, durationMs };
    }
  }

  // ── Gestion des workspaces ─────────────────────────────────────────────────

  /**
   * Crée un workspace isolé pour une tâche et initialise un dépôt git.
   * Retourne le chemin absolu du workspace dans le conteneur.
   */
  async createWorkspace(taskId: string): Promise<string> {
    const workdir = `${WORKSPACE_BASE}/${taskId}`;

    logger.info('[SandboxService] Création du workspace', { taskId, workdir });

    // Créer le répertoire
    const mkdirResult = await this.exec(`mkdir -p "${workdir}"`);
    if (mkdirResult.exitCode !== 0) {
      throw new Error(`Impossible de créer le workspace ${workdir}: ${mkdirResult.stderr}`);
    }

    // Initialiser git (nécessaire pour GitHub plus tard)
    await this.exec('git init', workdir);

    logger.info('[SandboxService] Workspace créé', { workdir });
    return workdir;
  }

  /**
   * Supprime complètement le workspace d'une tâche.
   * Appelé dans le bloc finally de l'agent pour garantir le nettoyage.
   */
  async cleanWorkspace(taskId: string): Promise<void> {
    const workdir = `${WORKSPACE_BASE}/${taskId}`;
    logger.info('[SandboxService] Nettoyage du workspace', { taskId, workdir });
    await this.exec(`rm -rf "${workdir}"`);
    logger.info('[SandboxService] Workspace nettoyé', { workdir });
  }

  // ── Exploration du workspace ───────────────────────────────────────────────

  /**
   * Liste tous les fichiers du workspace (hors .git et node_modules).
   * Retourne les chemins relatifs depuis workdir.
   */
  async listFiles(workdir: string): Promise<string[]> {
    const result = await this.exec(
      `find . -type f -not -path './.git/*' -not -path './node_modules/*' -not -path './dist/*'`,
      workdir
    );

    if (result.exitCode !== 0 || !result.stdout.trim()) {
      return [];
    }

    return result.stdout
      .trim()
      .split('\n')
      .map(f => f.trim().replace(/^\.\//, ''))  // enlever le "./" initial
      .filter(f => f.length > 0);
  }

  /**
   * Lit le contenu d'un fichier dans le workspace.
   * Throw si le fichier n'existe pas ou est illisible.
   */
  async readFile(workdir: string, filepath: string): Promise<string> {
    const result = await this.exec(`cat "${this.escapeForBash(filepath)}"`, workdir);

    if (result.exitCode !== 0) {
      throw new Error(`Impossible de lire ${filepath}: ${result.stderr}`);
    }

    return result.stdout;
  }

  // ── Claude Code ───────────────────────────────────────────────────────────

  /**
   * Exécute Claude Code en mode headless dans le workspace.
   * Retourne le contenu généré et la liste des fichiers créés/modifiés.
   */
  async runClaudeCode(
    workdir: string,
    prompt: string,
    options: RunClaudeCodeOptions = {}
  ): Promise<ClaudeCodeResult> {
    const startedAt = Date.now();

    const {
      maxTurns = 10,
      allowedTools = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      outputFormat = 'json',
      appendSystemPrompt,
    } = options;

    // Construction des arguments de la commande claude
    const toolsStr = allowedTools.join(',');
    const escapedPrompt = this.escapeForBash(prompt);

    let claudeCmd = `claude -p "${escapedPrompt}"`;
    claudeCmd += ` --output-format ${outputFormat}`;
    claudeCmd += ` --max-turns ${maxTurns}`;
    claudeCmd += ` --allowedTools "${toolsStr}"`;
    claudeCmd += ` --no-user-prompt`;  // mode non-interactif

    // Prompt système additionnel (contexte historique du projet)
    if (appendSystemPrompt) {
      claudeCmd += ` --append-system-prompt "${this.escapeForBash(appendSystemPrompt)}"`;
    }

    logger.info('[SandboxService] runClaudeCode', {
      workdir,
      maxTurns,
      outputFormat,
      promptPreview: prompt.substring(0, 100),
    });

    const result = await this.exec(claudeCmd, workdir, EXEC_TIMEOUT_MS);
    const durationMs = Date.now() - startedAt;

    // Extraction du contenu depuis la sortie JSON
    let content = result.stdout;

    if (outputFormat === 'json' && result.stdout.trim()) {
      try {
        const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
        // Claude Code retourne { result: string, ... } ou { content: string, ... }
        content = (parsed['result'] as string) ?? (parsed['content'] as string) ?? result.stdout;
      } catch {
        // Si le JSON est invalide, utiliser le stdout brut
        logger.warn('[SandboxService] Claude Code output JSON invalide, utilisation du stdout brut');
        content = result.stdout;
      }
    }

    // Récupérer la liste des fichiers créés après l'exécution
    const filesCreated = await this.listFiles(workdir);

    logger.info('[SandboxService] runClaudeCode terminé', {
      exitCode: result.exitCode,
      durationMs,
      filesCount: filesCreated.length,
    });

    return {
      content,
      filesCreated,
      exitCode: result.exitCode,
      durationMs,
    };
  }

  // ── GitHub ────────────────────────────────────────────────────────────────

  /**
   * Initialise ou clone un repo GitHub dans le workspace.
   * Si le repo existe → clone; sinon → crée avec gh repo create.
   * Retourne l'URL du repo.
   */
  async initGitHubRepo(
    workdir: string,
    repoName: string,
    options: InitGitHubRepoOptions = {}
  ): Promise<string> {
    const { org, isPrivate = true, description = '' } = options;

    // Nom complet du repo : org/nom ou nom seul
    const fullName = org ? `${org}/${repoName}` : repoName;

    logger.info('[SandboxService] initGitHubRepo', { fullName, isPrivate });

    // Vérifier si le repo existe déjà
    const viewResult = await this.exec(`gh repo view "${fullName}" --json url -q .url`, workdir);

    if (viewResult.exitCode === 0 && viewResult.stdout.trim()) {
      // Le repo existe — configurer l'origin
      const repoUrl = viewResult.stdout.trim();
      await this.exec(`git remote remove origin 2>/dev/null || true`, workdir);
      await this.exec(`git remote add origin "${repoUrl}"`, workdir);
      logger.info('[SandboxService] Repo existant configuré', { repoUrl });
      return repoUrl;
    }

    // Le repo n'existe pas — le créer
    const visibilityFlag = isPrivate ? '--private' : '--public';
    const descFlag = description ? `--description "${this.escapeForBash(description)}"` : '';
    const orgFlag = org ? `--org "${org}"` : '';

    const createResult = await this.exec(
      `gh repo create "${fullName}" ${visibilityFlag} ${descFlag} ${orgFlag} --source . --remote origin --push 2>&1 || gh repo create "${repoName}" ${visibilityFlag} ${descFlag} --source . --remote origin`,
      workdir
    );

    if (createResult.exitCode !== 0) {
      throw new Error(`Impossible de créer le repo GitHub ${fullName}: ${createResult.stderr}`);
    }

    // Récupérer l'URL du repo créé
    const urlResult = await this.exec(
      `gh repo view "${fullName}" --json url -q .url 2>/dev/null || git remote get-url origin`,
      workdir
    );

    const repoUrl = urlResult.stdout.trim();
    logger.info('[SandboxService] Repo créé', { repoUrl });
    return repoUrl;
  }

  /**
   * Commit tous les fichiers modifiés et pousse sur la branche distante.
   * Retourne les informations de la publication.
   */
  async commitAndPush(
    workdir: string,
    message: string,
    branch: string = 'main'
  ): Promise<GitHubRepoResult> {
    logger.info('[SandboxService] commitAndPush', { workdir, branch, message });

    // Stage tous les fichiers
    await this.exec('git add -A', workdir);

    // Vérifier s'il y a des changements à commiter
    const statusResult = await this.exec('git status --porcelain', workdir);
    if (!statusResult.stdout.trim()) {
      logger.warn('[SandboxService] Rien à commiter — workspace inchangé');
      // Récupérer le SHA du dernier commit existant
      const shaResult = await this.exec('git rev-parse HEAD 2>/dev/null || echo ""', workdir);
      const repoUrlResult = await this.exec('git remote get-url origin 2>/dev/null || echo ""', workdir);
      return {
        repoUrl: repoUrlResult.stdout.trim(),
        commitSha: shaResult.stdout.trim(),
        branch,
      };
    }

    // Commit
    const commitResult = await this.exec(
      `git commit -m "${this.escapeForBash(message)}"`,
      workdir
    );
    if (commitResult.exitCode !== 0) {
      throw new Error(`Échec du commit: ${commitResult.stderr}`);
    }

    // Push avec création de branche distante si nécessaire
    const pushResult = await this.exec(
      `git push -u origin ${branch} 2>&1`,
      workdir
    );
    if (pushResult.exitCode !== 0) {
      throw new Error(`Échec du push: ${pushResult.stderr}`);
    }

    // Récupérer le SHA du commit et l'URL du repo
    const shaResult = await this.exec('git rev-parse HEAD', workdir);
    const repoUrlResult = await this.exec('git remote get-url origin', workdir);

    const result: GitHubRepoResult = {
      repoUrl: repoUrlResult.stdout.trim(),
      commitSha: shaResult.stdout.trim(),
      branch,
    };

    logger.info('[SandboxService] Push réussi', result);
    return result;
  }

  // ── Initialisation de projet ───────────────────────────────────────────────

  /**
   * Initialise un projet Node.js / TypeScript dans le workspace.
   * Crée package.json, tsconfig.json et le dossier src/.
   */
  async initNodeProject(workdir: string, projectName: string): Promise<void> {
    logger.info('[SandboxService] initNodeProject', { workdir, projectName });

    // Initialiser npm et configurer le nom du projet
    await this.exec('npm init -y', workdir);
    await this.exec(`npm pkg set name="${this.escapeForBash(projectName)}"`, workdir);

    // Installer les dépendances TypeScript de base
    await this.exec(
      'npm install typescript @types/node --save-dev --prefer-offline 2>&1',
      workdir
    );

    // Créer un tsconfig.json minimal
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        outDir: 'dist',
        rootDir: 'src',
        esModuleInterop: true,
        skipLibCheck: true,
        declaration: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist'],
    };

    const tsconfigJson = JSON.stringify(tsconfig, null, 2);
    await this.exec(
      `printf '%s' "${this.escapeForBash(tsconfigJson)}" > tsconfig.json`,
      workdir
    );

    // Créer le dossier src/
    await this.exec('mkdir -p src', workdir);

    logger.info('[SandboxService] Projet Node.js initialisé', { workdir, projectName });
  }

  // ── Build & Tests ─────────────────────────────────────────────────────────

  /**
   * Compile le TypeScript du projet.
   * Essaie d'abord --noEmit (vérification de types), puis compilation complète.
   */
  async buildProject(workdir: string): Promise<SandboxExecResult> {
    logger.info('[SandboxService] buildProject', { workdir });
    const result = await this.exec(
      'npx tsc --noEmit 2>&1 || npx tsc 2>&1',
      workdir
    );
    logger.info('[SandboxService] buildProject terminé', {
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    });
    return result;
  }

  /**
   * Exécute les tests Vitest avec rapport JSON.
   */
  async runTests(workdir: string): Promise<SandboxExecResult> {
    logger.info('[SandboxService] runTests', { workdir });
    const result = await this.exec(
      'npx vitest run --reporter=json 2>&1',
      workdir
    );
    logger.info('[SandboxService] runTests terminé', {
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    });
    return result;
  }

  // ── Health check ──────────────────────────────────────────────────────────

  /**
   * Vérifie que le sandbox est opérationnel et que Claude Code est disponible.
   * Retourne true/false sans jamais throw.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.exec(
        'echo "ok" && claude --version',
        undefined,
        10_000 // timeout court : 10s
      );
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  // ── Snapshot du workspace ─────────────────────────────────────────────────

  /**
   * Prend un snapshot complet du workspace pour l'historisation.
   * Exclut node_modules, .git, dist, package-lock.json et les binaires.
   * Tronque les fichiers > 100 Ko à 200 lignes.
   */
  async snapshotWorkspace(workdir: string): Promise<{
    fileTree: string[];
    fileContents: Record<string, string>;
    totalSizeBytes: number;
  }> {
    logger.info('[SandboxService] snapshotWorkspace', { workdir });

    // Obtenir l'arbre complet des fichiers (déjà filtré par listFiles)
    const allFiles = await this.listFiles(workdir);

    // Filtrer davantage : exclure binaires et package-lock.json
    const fileTree = allFiles.filter(filepath => {
      // Exclure package-lock.json
      if (filepath.endsWith('package-lock.json')) return false;
      // Exclure les fichiers binaires par extension
      const ext = filepath.lastIndexOf('.') !== -1
        ? filepath.substring(filepath.lastIndexOf('.')).toLowerCase()
        : '';
      if (BINARY_EXTENSIONS.has(ext)) return false;
      return true;
    });

    // Lire le contenu de chaque fichier
    const fileContents: Record<string, string> = {};
    let totalSizeBytes = 0;

    for (const filepath of fileTree) {
      try {
        // Obtenir la taille du fichier avant de le lire
        const sizeResult = await this.exec(
          `wc -c < "${this.escapeForBash(filepath)}" 2>/dev/null || echo "0"`,
          workdir
        );
        const fileSizeBytes = parseInt(sizeResult.stdout.trim(), 10) || 0;
        totalSizeBytes += fileSizeBytes;

        if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
          // Tronquer aux 200 premières lignes
          const truncResult = await this.exec(
            `head -200 "${this.escapeForBash(filepath)}"`,
            workdir
          );
          fileContents[filepath] =
            truncResult.stdout +
            `\n[TRUNCATED — ${fileSizeBytes} bytes total]`;
        } else {
          const content = await this.readFile(workdir, filepath);
          fileContents[filepath] = content;
        }
      } catch (err) {
        // Ne pas bloquer le snapshot si un fichier est illisible
        logger.warn('[SandboxService] Fichier illisible dans le snapshot', {
          filepath,
          error: (err as Error).message,
        });
        fileContents[filepath] = '[UNREADABLE]';
      }
    }

    logger.info('[SandboxService] Snapshot terminé', {
      filesCount: fileTree.length,
      totalSizeBytes,
    });

    return { fileTree, fileContents, totalSizeBytes };
  }
}

// ── Export singleton ──────────────────────────────────────────────────────────

export const sandboxService = new SandboxService();
