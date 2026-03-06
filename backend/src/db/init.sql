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
  id            TEXT        PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name          TEXT        NOT NULL,
  avatar        TEXT        NOT NULL DEFAULT '',
  color         TEXT        NOT NULL DEFAULT '#6554C0',
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,         -- hashé avec bcrypt
  role          TEXT        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('admin', 'member', 'viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
-- DONNÉES DE SEED (développement)
-- Mot de passe : "password123" hashé avec bcrypt (12 rounds)
-- Hash généré avec : bcrypt.hashSync('password123', 12)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Seed: Users ───────────────────────────────────────────────────────────────
INSERT INTO users (id, name, avatar, color, email, password_hash, role) VALUES
  ('u1', 'Alice Martin', 'AM', '#6554C0', 'alice@example.com',
   '$2a$12$nHBZfN.XXjpAMoeXgP24WeMxu1yOW.mK9vwj.fOWRQgWhmMdBCZwe', 'admin'),
  ('u2', 'Bob Kaplan',   'BK', '#0052CC', 'bob@example.com',
   '$2a$12$nHBZfN.XXjpAMoeXgP24WeMxu1yOW.mK9vwj.fOWRQgWhmMdBCZwe', 'member'),
  ('u3', 'Carol Singh',  'CS', '#00875A', 'carol@example.com',
   '$2a$12$nHBZfN.XXjpAMoeXgP24WeMxu1yOW.mK9vwj.fOWRQgWhmMdBCZwe', 'member')
ON CONFLICT (id) DO NOTHING;

-- ─── Seed: Project ─────────────────────────────────────────────────────────────
INSERT INTO projects (id, key, name, description, lead_id, type, color, emoji) VALUES
  ('proj-1', 'PROJ', 'My Project',
   'The main software project.',
   'u1', 'software', '#0052CC', '🚀')
ON CONFLICT (key) DO NOTHING;

-- ─── Seed: Project Members ─────────────────────────────────────────────────────
INSERT INTO project_members (project_id, user_id, role) VALUES
  ('proj-1', 'u1', 'lead'),
  ('proj-1', 'u2', 'developer'),
  ('proj-1', 'u3', 'developer')
ON CONFLICT (project_id, user_id) DO NOTHING;

-- ─── Seed: Sprint ──────────────────────────────────────────────────────────────
INSERT INTO sprints (id, project_id, name, goal, start_date, end_date, active) VALUES
  ('spr-1', 'proj-1', 'Sprint 1', 'Ship the first working version',
   CURRENT_DATE, CURRENT_DATE + 14, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── Seed: Issues ──────────────────────────────────────────────────────────────
INSERT INTO issues (id, key, project_id, sprint_id, type, title, description, priority, status, assignee_id, reporter_id, story_points, labels, board_order) VALUES
  ('i1', 'PROJ-1', 'proj-1', 'spr-1', 'story',
   'Setup project repository',
   '# Setup project repository\n\nInitialize Git, configure CI, and set up the dev environment.\n\n## Tasks\n- [x] Init git repo\n- [x] Configure CI/CD\n- [x] Setup Docker\n',
   'high', 'done', 'u1', 'u1', 3, '{setup,devops}', 10),
  ('i2', 'PROJ-2', 'proj-1', 'spr-1', 'task',
   'Design database schema',
   '# Database Schema Design\n\nDefine tables, relationships, and indexes for core domain models.\n\n## Tables to design\n- Users & authentication\n- Projects & sprints\n- Issues & comments\n- Confluence spaces & pages\n',
   'medium', 'in-progress', 'u2', 'u1', 5, '{backend,database}', 20),
  ('i3', 'PROJ-3', 'proj-1', 'spr-1', 'bug',
   'Fix login page layout on mobile',
   '# Bug: Login page overflow on mobile\n\n## Description\nThe form overflows on screens smaller than 375px.\n\n## Steps to reproduce\n1. Open app on mobile (< 375px)\n2. Navigate to /login\n3. Form elements overflow the viewport\n\n## Expected\nForm is fully visible and usable on mobile.\n',
   'high', 'todo', 'u3', 'u2', 2, '{bug,mobile,ui}', 30),
  ('i4', 'PROJ-4', 'proj-1', NULL, 'task',
   'Write API documentation',
   '# API Documentation\n\nDocument all REST API endpoints using OpenAPI/Swagger.\n\n## Endpoints to document\n- Auth endpoints\n- Projects CRUD\n- Issues CRUD\n- Confluence pages\n',
   'low', 'backlog', NULL, 'u1', 3, '{documentation}', 40)
ON CONFLICT (key) DO NOTHING;

-- ─── Seed: Comments ────────────────────────────────────────────────────────────
INSERT INTO comments (id, issue_id, author_id, body) VALUES
  ('c1', 'i2', 'u1', 'Schema looks good! Don''t forget to add the indexes.'),
  ('c2', 'i2', 'u2', 'Thanks! I''ll add composite indexes for performance-critical queries.'),
  ('c3', 'i3', 'u3', 'Reproducing on iPhone SE. The submit button is cut off.')
ON CONFLICT (id) DO NOTHING;

-- ─── Seed: Confluence Spaces ───────────────────────────────────────────────────
INSERT INTO confluence_spaces (id, key, name, description, emoji, color, owner_id) VALUES
  ('space-1', 'ENG', 'Engineering',
   'Technical docs, architecture decisions, runbooks, and onboarding guides.', '⚙️', '#0052CC', 'u1'),
  ('space-2', 'PM',  'Product',
   'Product strategy, roadmaps, specs, and user research.', '🧭', '#6554C0', 'u2')
ON CONFLICT (key) DO NOTHING;

-- ─── Seed: Confluence Pages ────────────────────────────────────────────────────
INSERT INTO confluence_pages (id, space_id, space_key, title, content, author_id, tags, emoji) VALUES
  ('p1', 'space-1', 'ENG', 'Getting Started',
E'# Getting Started

Welcome to the **Engineering** space! This guide will help you get up and running.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Git

## Quick Start

```bash
# 1. Clone the repository
git clone <your-repo>
cd <your-repo>

# 2. Configure environment
cp .env.example .env
# Edit .env with your values

# 3. Start all services
docker compose up --build
```

## Development Mode

```bash
# Frontend (port 5173)
npm run dev

# Backend (port 4000)
cd backend && npm run dev
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `docker compose up` | Start all services |
| `docker compose down -v` | Stop and clean up |
| `docker compose logs -f` | Follow all logs |

## Architecture

```
Browser → Nginx (80) → Backend API (4000) → PostgreSQL
```
',
   'u1', '{guide,setup,onboarding}', '🚀'),
  ('p2', 'space-2', 'PM', 'Product Roadmap',
E'# Product Roadmap

This page tracks our product goals, milestones, and priorities.

## Q1 Goals

- [ ] Launch MVP
- [ ] Onboard first 10 users
- [ ] Collect feedback via surveys

## Q2 Goals

- [ ] Feature iteration based on Q1 feedback
- [ ] Performance improvements (< 2s page load)
- [ ] Mobile responsive design

## Q3 Goals

- [ ] Native mobile apps (iOS/Android)
- [ ] Advanced search and filtering
- [ ] Integrations (Slack, GitHub)

## Principles

> **Build fast, learn faster.** Ship often, measure everything, and iterate.

1. **User-first**: Every decision starts with the user problem
2. **Data-driven**: Metrics guide prioritization
3. **Iterative**: Small, frequent releases over big-bang launches
',
   'u2', '{roadmap,planning,strategy}', '🗺️'),
  ('p3', 'space-1', 'ENG', 'API Reference',
E'# API Reference

Complete documentation for the REST API.

## Authentication

All endpoints (except `/api/auth/*`) require a Bearer token:

```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Login and get JWT |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |

### Issues

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/issues` | List issues (with filters) |
| POST | `/api/issues` | Create issue |
| GET | `/api/issues/:id` | Get issue with comments |
| PUT | `/api/issues/:id` | Update issue |
| PATCH | `/api/issues/:id/status` | Update status |
| PATCH | `/api/issues/reorder` | Reorder for drag & drop |
| DELETE | `/api/issues/:id` | Delete issue |
',
   'u1', '{api,documentation,reference}', '📚')
ON CONFLICT (id) DO NOTHING;
