import { pool } from './pool';
import logger from '../logger';

const SCHEMA = `
-- Users
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  name          VARCHAR(255) NOT NULL,
  avatar        VARCHAR(8)   NOT NULL DEFAULT '',
  color         VARCHAR(20)  NOT NULL DEFAULT '#6554C0',
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  role          VARCHAR(20)  NOT NULL DEFAULT 'member',
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id          VARCHAR(36) PRIMARY KEY,
  key         VARCHAR(20)  UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT         DEFAULT '',
  lead_id     VARCHAR(36)  REFERENCES users(id),
  type        VARCHAR(20)  DEFAULT 'software',
  color       VARCHAR(20)  DEFAULT '#0052CC',
  emoji       VARCHAR(8)   DEFAULT '🚀',
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Project members
CREATE TABLE IF NOT EXISTS project_members (
  project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE,
  user_id    VARCHAR(36) REFERENCES users(id)    ON DELETE CASCADE,
  role       VARCHAR(20) DEFAULT 'member',
  PRIMARY KEY (project_id, user_id)
);

-- Sprints
CREATE TABLE IF NOT EXISTS sprints (
  id          VARCHAR(36) PRIMARY KEY,
  project_id  VARCHAR(36)  REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  goal        TEXT,
  start_date  DATE,
  end_date    DATE,
  active      BOOLEAN      DEFAULT FALSE,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Issues
CREATE TABLE IF NOT EXISTS issues (
  id            VARCHAR(36) PRIMARY KEY,
  key           VARCHAR(30)  UNIQUE NOT NULL,
  project_id    VARCHAR(36)  REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id     VARCHAR(36)  REFERENCES sprints(id) ON DELETE SET NULL,
  type          VARCHAR(20)  NOT NULL DEFAULT 'task',
  title         VARCHAR(500) NOT NULL,
  description   TEXT         DEFAULT '',
  priority      VARCHAR(20)  NOT NULL DEFAULT 'medium',
  status        VARCHAR(30)  NOT NULL DEFAULT 'todo',
  assignee_id   VARCHAR(36)  REFERENCES users(id),
  reporter_id   VARCHAR(36)  REFERENCES users(id),
  story_points  INTEGER      DEFAULT 0,
  epic_key      VARCHAR(30),
  labels        TEXT[]       DEFAULT '{}',
  board_order   INTEGER      DEFAULT 0,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- Issue links
CREATE TABLE IF NOT EXISTS issue_links (
  id              VARCHAR(36) PRIMARY KEY,
  source_issue_id VARCHAR(36) REFERENCES issues(id) ON DELETE CASCADE,
  target_issue_id VARCHAR(36) REFERENCES issues(id) ON DELETE CASCADE,
  link_type       VARCHAR(50) DEFAULT 'relates_to',
  UNIQUE (source_issue_id, target_issue_id)
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id          VARCHAR(36) PRIMARY KEY,
  issue_id    VARCHAR(36)  REFERENCES issues(id) ON DELETE CASCADE,
  author_id   VARCHAR(36)  REFERENCES users(id),
  body        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Confluence spaces
CREATE TABLE IF NOT EXISTS confluence_spaces (
  id          VARCHAR(36) PRIMARY KEY,
  key         VARCHAR(20)  UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT         DEFAULT '',
  emoji       VARCHAR(8)   DEFAULT '📄',
  color       VARCHAR(20)  DEFAULT '#0052CC',
  owner_id    VARCHAR(36)  REFERENCES users(id),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Confluence pages
CREATE TABLE IF NOT EXISTS confluence_pages (
  id          VARCHAR(36) PRIMARY KEY,
  space_id    VARCHAR(36)  REFERENCES confluence_spaces(id) ON DELETE CASCADE,
  space_key   VARCHAR(20)  NOT NULL DEFAULT '',
  parent_id   VARCHAR(36)  REFERENCES confluence_pages(id) ON DELETE SET NULL,
  title       VARCHAR(500) NOT NULL,
  content     TEXT         DEFAULT '',
  author_id   VARCHAR(36)  REFERENCES users(id),
  emoji       VARCHAR(8)   DEFAULT '📄',
  tags        TEXT[]       DEFAULT '{}',
  likes       INTEGER      DEFAULT 0,
  views       INTEGER      DEFAULT 0,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_issues_project    ON issues(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_sprint     ON issues(sprint_id);
CREATE INDEX IF NOT EXISTS idx_issues_status     ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_assignee   ON issues(assignee_id);
CREATE INDEX IF NOT EXISTS idx_comments_issue    ON comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_pages_space       ON confluence_pages(space_id);
CREATE INDEX IF NOT EXISTS idx_pages_parent      ON confluence_pages(parent_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS issues_updated_at   ON issues;
DROP TRIGGER IF EXISTS comments_updated_at ON comments;
DROP TRIGGER IF EXISTS pages_updated_at    ON confluence_pages;

CREATE TRIGGER issues_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER pages_updated_at
  BEFORE UPDATE ON confluence_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
`;

async function migrate(): Promise<void> {
  logger.info('Running database migrations...');
  try {
    await pool.query(SCHEMA);
    logger.info('Migrations completed successfully');
  } catch (err) {
    logger.error('Migration failed', { error: err });
    throw err;
  }
}

migrate()
  .then(() => pool.end())
  .catch((err) => { logger.error(err); process.exit(1); });
