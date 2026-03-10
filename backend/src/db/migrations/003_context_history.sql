-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 003 — Table ai_context_history
--
-- Historisation complète du contexte de chaque tâche AI :
--   - Snapshot du workspace (fichiers, arbre, taille)
--   - Résultats de compilation et de tests
--   - Informations GitHub (repo, commit, branche)
--   - Résumé généré par l'agent
--   - Métriques (tokens, durée, fichiers)
--   - Chaînage parent/enfant pour la mémoire cumulative par projet
--
-- Application manuelle sur une DB existante :
--   docker exec atlassian_db psql -U atlassian -d atlassian \
--     -f /path/to/003_context_history.sql
--
-- Ce fichier est également intégré dans init.sql pour les nouvelles installations.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Table principale ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_context_history (
  -- Identifiant unique du snapshot
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lien vers la tâche qui a produit ce contexte
  task_queue_id   UUID NOT NULL REFERENCES ai_task_queue(id) ON DELETE CASCADE,

  -- Lien vers l'issue Jira parente
  issue_id        UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,

  -- Lien vers le projet (permet de requêter tout l'historique d'un projet)
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Identifiant de l'agent qui a produit ce contexte
  agent_id        UUID NOT NULL,

  -- ── Snapshot du workspace ──────────────────────────────────────────────
  -- Arbre complet des fichiers (chemins relatifs)
  file_tree       JSONB NOT NULL DEFAULT '[]',

  -- Contenu complet des fichiers : { "src/index.ts": "...", ... }
  file_contents   JSONB NOT NULL DEFAULT '{}',

  -- Taille totale du workspace en octets
  total_size_bytes BIGINT NOT NULL DEFAULT 0,

  -- ── Résultats build & test ─────────────────────────────────────────────
  -- Résultat de la compilation : { exitCode, stdout, stderr, durationMs }
  build_result    JSONB DEFAULT NULL,

  -- Résultat des tests : { exitCode, stdout, stderr, durationMs, passed, failed, skipped }
  test_result     JSONB DEFAULT NULL,

  -- ── GitHub ─────────────────────────────────────────────────────────────
  -- URL du repo GitHub (null si pas de push)
  github_repo_url TEXT DEFAULT NULL,

  -- SHA du dernier commit pushé
  github_commit_sha TEXT DEFAULT NULL,

  -- Branche utilisée
  github_branch   TEXT DEFAULT 'main',

  -- ── Résumé AI ──────────────────────────────────────────────────────────
  -- Résumé généré par l'agent en fin de tâche
  ai_summary      TEXT DEFAULT NULL,

  -- Prompt système utilisé par l'agent
  system_prompt_used TEXT DEFAULT NULL,

  -- ── Métriques ──────────────────────────────────────────────────────────
  -- Tokens totaux consommés pendant la tâche
  total_tokens_used INTEGER NOT NULL DEFAULT 0,

  -- Durée totale de la tâche en millisecondes
  total_duration_ms INTEGER NOT NULL DEFAULT 0,

  -- Nombre de fichiers générés
  files_count     INTEGER NOT NULL DEFAULT 0,

  -- Nombre de tours Claude Code utilisés
  claude_code_turns INTEGER DEFAULT NULL,

  -- ── Contexte hérité ────────────────────────────────────────────────────
  -- Référence au snapshot précédent du même projet (chaînage)
  parent_history_id UUID DEFAULT NULL REFERENCES ai_context_history(id) ON DELETE SET NULL,

  -- Tags libres pour filtrage (ex: ["feature", "refactor", "bugfix", "failed"])
  tags            JSONB NOT NULL DEFAULT '[]',

  -- ── Timestamps ─────────────────────────────────────────────────────────
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Index ─────────────────────────────────────────────────────────────────────

-- Index pour requêter l'historique par projet (cas d'usage principal)
CREATE INDEX IF NOT EXISTS idx_context_history_project
  ON ai_context_history(project_id, created_at DESC);

-- Index pour requêter l'historique par issue
CREATE INDEX IF NOT EXISTS idx_context_history_issue
  ON ai_context_history(issue_id, created_at DESC);

-- Index pour le chaînage parent (remontée de la chaîne d'ancêtres)
CREATE INDEX IF NOT EXISTS idx_context_history_parent
  ON ai_context_history(parent_history_id);

-- ── Commentaire ───────────────────────────────────────────────────────────────
COMMENT ON TABLE ai_context_history IS
  'Historique complet du contexte de chaque tâche AI — permet la mémoire cumulative entre tâches d''un même projet';
