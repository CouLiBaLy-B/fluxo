-- ═══════════════════════════════════════════════════════════════════════════════
-- Atlassian Clone — Schéma PostgreSQL complet
-- Source de vérité unique (remplace migrate.ts)
-- Auto-exécuté par Docker au premier démarrage via /docker-entrypoint-initdb.d/
-- ═══════════════════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- génération d'UUID
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- recherche full-text approximative

-- ─── Fonction utilitaire : mise à jour automatique de updated_at ────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLES JIRA
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                     TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name                   TEXT        NOT NULL,
  avatar                 TEXT        NOT NULL DEFAULT '',
  color                  TEXT        NOT NULL DEFAULT '#6554C0',
  email                  TEXT        UNIQUE NOT NULL,
  password_hash          TEXT        NOT NULL,         -- hashé avec bcrypt
  role                   TEXT        NOT NULL DEFAULT 'member'
                                     CHECK (role IN ('admin', 'member', 'viewer')),
  failed_login_attempts  INTEGER     NOT NULL DEFAULT 0,   -- verrouillage après 10 échecs
  locked_until           TIMESTAMPTZ,                      -- NULL = non verrouillé
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Projects ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  key         TEXT        UNIQUE NOT NULL,    -- ex: PROJ, BUG, FEAT
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  lead_id     TEXT        REFERENCES users(id) ON DELETE SET NULL,
  type        TEXT        NOT NULL DEFAULT 'software'
                          CHECK (type IN ('software', 'business', 'service')),
  color       TEXT        NOT NULL DEFAULT '#0052CC',
  emoji       TEXT        NOT NULL DEFAULT '🚀',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Project Members ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'developer'
                         CHECK (role IN ('lead', 'developer', 'viewer')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- ─── Sprints ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sprints (
  id         TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  project_id TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  goal       TEXT        NOT NULL DEFAULT '',
  start_date DATE,
  end_date   DATE,
  active     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- La date de fin doit être après la date de début si les deux sont définies
  CONSTRAINT sprints_dates_check CHECK (
    (start_date IS NULL OR end_date IS NULL) OR (end_date >= start_date)
  )
);

DROP TRIGGER IF EXISTS sprints_updated_at ON sprints;
CREATE TRIGGER sprints_updated_at
  BEFORE UPDATE ON sprints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
CREATE INDEX IF NOT EXISTS idx_sprints_active  ON sprints(active) WHERE active = TRUE;

-- ─── Issues ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issues (
  id            TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  key           TEXT        UNIQUE NOT NULL,    -- ex: PROJ-1
  project_id    TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id     TEXT        REFERENCES sprints(id) ON DELETE SET NULL,
  type          TEXT        NOT NULL DEFAULT 'task'
                            CHECK (type IN ('story', 'bug', 'task', 'epic', 'subtask')),
  title         TEXT        NOT NULL,
  description   TEXT        NOT NULL DEFAULT '',
  priority      TEXT        NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('lowest', 'low', 'medium', 'high', 'highest')),
  status        TEXT        NOT NULL DEFAULT 'todo'
                            CHECK (status IN ('backlog', 'todo', 'in-progress', 'in-review', 'done')),
  assignee_id   TEXT        REFERENCES users(id) ON DELETE SET NULL,
  reporter_id   TEXT        REFERENCES users(id) ON DELETE SET NULL,
  story_points  INTEGER     NOT NULL DEFAULT 0  CHECK (story_points >= 0),
  labels        TEXT[]      NOT NULL DEFAULT '{}',
  epic_key      TEXT,
  board_order   INTEGER     NOT NULL DEFAULT 0  CHECK (board_order >= 0),
  -- Soft delete : la date de suppression (NULL = non supprimé)
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS issues_updated_at ON issues;
CREATE TRIGGER issues_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index simples
CREATE INDEX IF NOT EXISTS idx_issues_project    ON issues(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_sprint     ON issues(sprint_id)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_status     ON issues(status)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_assignee   ON issues(assignee_id);
-- Index composites pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_issues_project_status   ON issues(project_id, status)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_sprint_status    ON issues(sprint_id, status)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_project_order    ON issues(project_id, board_order) WHERE deleted_at IS NULL;
-- Index pour la recherche full-text approximative (pg_trgm)
CREATE INDEX IF NOT EXISTS idx_issues_title_trgm ON issues USING gin(title gin_trgm_ops);

-- ─── Comments ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id         TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  issue_id   TEXT        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id  TEXT        REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS comments_updated_at ON comments;
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id);

-- ─── Issue Links (relations entre issues) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS issue_links (
  id           TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  source_id    TEXT        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  target_id    TEXT        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  link_type    TEXT        NOT NULL DEFAULT 'relates'
                           CHECK (link_type IN ('blocks', 'is-blocked-by', 'relates', 'duplicates', 'is-duplicated-by', 'clones', 'is-cloned-by')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Pas de lien dupliqué dans le même sens
  UNIQUE (source_id, target_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_issue_links_source ON issue_links(source_id);
CREATE INDEX IF NOT EXISTS idx_issue_links_target ON issue_links(target_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLES CONFLUENCE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Confluence Spaces ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS confluence_spaces (
  id          TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  key         TEXT        UNIQUE NOT NULL,    -- ex: ENG, PM, HR
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  emoji       TEXT        NOT NULL DEFAULT '📁',
  color       TEXT        NOT NULL DEFAULT '#0052CC',
  owner_id    TEXT        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS spaces_updated_at ON confluence_spaces;
CREATE TRIGGER spaces_updated_at
  BEFORE UPDATE ON confluence_spaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Confluence Pages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS confluence_pages (
  id         TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  space_id   TEXT        NOT NULL REFERENCES confluence_spaces(id) ON DELETE CASCADE,
  space_key  TEXT        NOT NULL,            -- dénormalisé pour les requêtes rapides
  parent_id  TEXT        REFERENCES confluence_pages(id) ON DELETE SET NULL,
  title      TEXT        NOT NULL,
  content    TEXT        NOT NULL DEFAULT '',  -- Markdown sanitisé
  author_id  TEXT        REFERENCES users(id) ON DELETE SET NULL,
  tags       TEXT[]      NOT NULL DEFAULT '{}',
  emoji      TEXT        NOT NULL DEFAULT '📄',
  likes      INTEGER     NOT NULL DEFAULT 0   CHECK (likes >= 0),
  views      INTEGER     NOT NULL DEFAULT 0   CHECK (views >= 0),
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS pages_updated_at ON confluence_pages;
CREATE TRIGGER pages_updated_at
  BEFORE UPDATE ON confluence_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index
CREATE INDEX IF NOT EXISTS idx_pages_space         ON confluence_pages(space_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pages_parent        ON confluence_pages(parent_id)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pages_space_parent  ON confluence_pages(space_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pages_author        ON confluence_pages(author_id);
CREATE INDEX IF NOT EXISTS idx_pages_title_trgm    ON confluence_pages USING gin(title gin_trgm_ops);

-- ─── Page Comments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS page_comments (
  id         TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  page_id    TEXT        NOT NULL REFERENCES confluence_pages(id) ON DELETE CASCADE,
  author_id  TEXT        REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS page_comments_updated_at ON page_comments;
CREATE TRIGGER page_comments_updated_at
  BEFORE UPDATE ON page_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_page_comments_page ON page_comments(page_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED : supprimé — l'admin est créé au démarrage via bootstrapAdmin() (server.ts)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLES AGENTS AI
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Agents AI enregistrés dans le système ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_agents (
  id                   TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name                 TEXT        NOT NULL,           -- "Agent Developer"
  slug                 TEXT        UNIQUE NOT NULL,    -- "agent-developer"
  type                 TEXT        NOT NULL
                                   CHECK (type IN ('developer', 'qa', 'writer', 'researcher', 'architect')),
  description          TEXT        NOT NULL DEFAULT '',
  avatar_emoji         TEXT        NOT NULL DEFAULT '🤖',
  avatar_color         TEXT        NOT NULL DEFAULT '#6554C0',
  model                TEXT        NOT NULL DEFAULT 'gpt-4o',
  system_prompt        TEXT        NOT NULL DEFAULT '',
  capabilities         JSONB       NOT NULL DEFAULT '[]',
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  max_concurrent_tasks INTEGER     NOT NULL DEFAULT 3,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── File d'attente des tâches AI ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_task_queue (
  id            TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  issue_id      TEXT        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  agent_id      TEXT        NOT NULL REFERENCES ai_agents(id),
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  priority      INTEGER     NOT NULL DEFAULT 5,
  instructions  TEXT        NOT NULL DEFAULT '',
  context       JSONB       NOT NULL DEFAULT '{}',
  progress      INTEGER     NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error_message TEXT,
  retry_count   INTEGER     NOT NULL DEFAULT 0,
  max_retries   INTEGER     NOT NULL DEFAULT 3,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS ai_task_queue_updated_at ON ai_task_queue;
CREATE TRIGGER ai_task_queue_updated_at
  BEFORE UPDATE ON ai_task_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_ai_task_queue_issue   ON ai_task_queue(issue_id);
CREATE INDEX IF NOT EXISTS idx_ai_task_queue_agent   ON ai_task_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_task_queue_status  ON ai_task_queue(status);

-- ─── Logs d'exécution des agents (chaque étape) ────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_agent_logs (
  id            TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  task_queue_id TEXT        NOT NULL REFERENCES ai_task_queue(id) ON DELETE CASCADE,
  agent_id      TEXT        NOT NULL REFERENCES ai_agents(id),
  issue_id      TEXT        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  level         TEXT        NOT NULL DEFAULT 'info'
                            CHECK (level IN ('info', 'warning', 'error', 'success')),
  step          TEXT        NOT NULL DEFAULT '',
  message       TEXT        NOT NULL,
  progress      INTEGER     CHECK (progress BETWEEN 0 AND 100),
  artifacts     JSONB       NOT NULL DEFAULT '[]',
  tokens_used   INTEGER     NOT NULL DEFAULT 0,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_task  ON ai_agent_logs(task_queue_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_issue ON ai_agent_logs(issue_id);

-- ─── Artefacts produits par les agents ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_artifacts (
  id            TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  task_queue_id TEXT        NOT NULL REFERENCES ai_task_queue(id) ON DELETE CASCADE,
  issue_id      TEXT        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  agent_id      TEXT        NOT NULL REFERENCES ai_agents(id),
  type          TEXT        NOT NULL
                            CHECK (type IN ('code', 'test', 'doc', 'report', 'diagram')),
  filename      TEXT        NOT NULL DEFAULT '',
  content       TEXT        NOT NULL DEFAULT '',
  language      TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_artifacts_task  ON ai_artifacts(task_queue_id);
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_issue ON ai_artifacts(issue_id);

-- ─── Liaison Issue Jira <-> Page Confluence (créée par l'agent) ───────────────
CREATE TABLE IF NOT EXISTS issue_confluence_links (
  id                   TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  issue_id             TEXT        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  page_id              TEXT        NOT NULL REFERENCES confluence_pages(id) ON DELETE CASCADE,
  link_type            TEXT        NOT NULL DEFAULT 'generated'
                                   CHECK (link_type IN ('generated', 'manual', 'referenced')),
  created_by_agent_id  TEXT        REFERENCES ai_agents(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issue_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_confluence_links_issue ON issue_confluence_links(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_confluence_links_page  ON issue_confluence_links(page_id);

-- ─── Configuration globale des agents par projet ──────────────────────────────
CREATE TABLE IF NOT EXISTS project_agent_config (
  id          TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  project_id  TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id    TEXT        NOT NULL REFERENCES ai_agents(id),
  is_enabled  BOOLEAN     NOT NULL DEFAULT true,
  auto_assign BOOLEAN     NOT NULL DEFAULT false,
  config      JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, agent_id)
);

-- ─── Extension de la table issues pour les agents AI ──────────────────────────
ALTER TABLE issues ADD COLUMN IF NOT EXISTS assigned_agent_id  TEXT REFERENCES ai_agents(id);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS ai_instructions    TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS ai_progress        INTEGER DEFAULT 0 CHECK (ai_progress BETWEEN 0 AND 100);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS ai_summary         TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS confluence_page_id TEXT REFERENCES confluence_pages(id);

CREATE INDEX IF NOT EXISTS idx_issues_agent ON issues(assigned_agent_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED : 5 Agents AI par défaut
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO ai_agents (id, name, slug, type, description, avatar_emoji, avatar_color, model, system_prompt, capabilities, max_concurrent_tasks) VALUES
  ('agent-dev', 'Agent Developer', 'agent-developer', 'developer',
   'Génère du code TypeScript/JavaScript propre et maintenable selon les bonnes pratiques.',
   '🧑‍💻', '#0052CC', 'gpt-4o',
   'Tu es un expert développeur full-stack. Tu génères du code TypeScript propre, bien commenté, avec gestion d''erreurs complète. Tu respectes les conventions du projet existant.',
   '["code","review","refactor","debug"]', 5),
  ('agent-qa', 'Agent QA Tester', 'agent-qa', 'qa',
   'Génère des tests unitaires, d''intégration et E2E avec couverture maximale.',
   '🧪', '#00875A', 'gpt-4o',
   'Tu es un expert QA. Tu génères des tests complets avec Jest, Vitest ou Playwright. Tu identifies les cas limites et t''assures d''une couverture maximale.',
   '["test","e2e","coverage","qa"]', 5),
  ('agent-writer', 'Agent Writer', 'agent-writer', 'writer',
   'Rédige de la documentation technique claire et structurée en Markdown.',
   '📝', '#6554C0', 'gpt-4o',
   'Tu es un expert en rédaction technique. Tu produis de la documentation claire, structurée en Markdown, avec des exemples concrets et des diagrammes textuels.',
   '["doc","markdown","wiki","readme"]', 3),
  ('agent-researcher', 'Agent Researcher', 'agent-researcher', 'researcher',
   'Analyse des problèmes techniques, effectue de la veille et propose des solutions.',
   '🔍', '#FF5630', 'gpt-4o',
   'Tu es un expert en recherche et analyse technique. Tu synthétises des informations complexes, compares des approches et fournis des recommandations étayées.',
   '["research","analysis","compare","recommend"]', 3),
  ('agent-architect', 'Agent Architect', 'agent-architect', 'architect',
   'Conçoit des architectures logicielles robustes et scalables.',
   '🏗️', '#FF991F', 'gpt-4o',
   'Tu es un architecte logiciel senior. Tu conçois des architectures évolutives, identifies les patterns appropriés et produis des diagrammes d''architecture détaillés.',
   '["architecture","design","diagram","pattern"]', 2)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARAMÈTRES APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES
  ('llm_provider', 'mock'),
  ('llm_model',    'mock')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 003 — Historique du contexte AI (mémoire cumulative par projet)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_context_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_queue_id   UUID NOT NULL REFERENCES ai_task_queue(id) ON DELETE CASCADE,
  issue_id        UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL,
  -- Snapshot du workspace
  file_tree       JSONB NOT NULL DEFAULT '[]',
  file_contents   JSONB NOT NULL DEFAULT '{}',
  total_size_bytes BIGINT NOT NULL DEFAULT 0,
  -- Résultats build & test
  build_result    JSONB DEFAULT NULL,
  test_result     JSONB DEFAULT NULL,
  -- GitHub
  github_repo_url   TEXT DEFAULT NULL,
  github_commit_sha TEXT DEFAULT NULL,
  github_branch     TEXT DEFAULT 'main',
  -- Résumé AI
  ai_summary         TEXT DEFAULT NULL,
  system_prompt_used TEXT DEFAULT NULL,
  -- Métriques
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  files_count       INTEGER NOT NULL DEFAULT 0,
  claude_code_turns INTEGER DEFAULT NULL,
  -- Chaînage parent/enfant
  parent_history_id UUID DEFAULT NULL REFERENCES ai_context_history(id) ON DELETE SET NULL,
  tags              JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_context_history_project
  ON ai_context_history(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_context_history_issue
  ON ai_context_history(issue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_context_history_parent
  ON ai_context_history(parent_history_id);

COMMENT ON TABLE ai_context_history IS
  'Historique complet du contexte de chaque tâche AI — permet la mémoire cumulative entre tâches d''un même projet';
