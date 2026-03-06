import { pool } from './pool';
import logger from '../logger';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

async function seed(): Promise<void> {
  logger.info('Seeding database...');

  // Idempotent: skip if data already exists
  const { rows } = await pool.query('SELECT COUNT(*) FROM users');
  if (parseInt(rows[0].count, 10) > 0) {
    logger.info('Database already seeded, skipping.');
    return;
  }

  // ── Admin user from environment variables ───────────────────────────────────
  const adminEmail    = process.env.ADMIN_EMAIL    ?? 'admin@example.com';
  const adminUsername = process.env.ADMIN_USERNAME ?? 'Admin';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123456';
  const adminAvatar   = adminUsername.trim().split(' ')
    .map(n => n[0]?.toUpperCase() ?? '').join('').slice(0, 2);
  const adminHash = await bcrypt.hash(adminPassword, 10);

  await pool.query(
    `INSERT INTO users (id, name, avatar, color, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5,$6,'admin') ON CONFLICT (email) DO NOTHING`,
    [randomUUID(), adminUsername.trim(), adminAvatar, '#0052CC', adminEmail, adminHash]
  );
  logger.info('Admin user created', { email: adminEmail });

  // ── Demo users (password: password123) ──────────────────────────────────────
  const demoHash = await bcrypt.hash('password123', 10);

  const users = [
    { id: 'u1', name: 'Alice Dupont',   avatar: 'AD', color: '#0052CC', email: 'alice@acme.com' },
    { id: 'u2', name: 'Bob Martin',     avatar: 'BM', color: '#00875A', email: 'bob@acme.com' },
    { id: 'u3', name: 'Clara Petit',    avatar: 'CP', color: '#6554C0', email: 'clara@acme.com' },
    { id: 'u4', name: 'David Leroy',    avatar: 'DL', color: '#DE350B', email: 'david@acme.com' },
    { id: 'u5', name: 'Eva Moreau',     avatar: 'EM', color: '#974F0C', email: 'eva@acme.com' },
  ];

  for (const u of users) {
    await pool.query(
      `INSERT INTO users (id, name, avatar, color, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6,'member') ON CONFLICT DO NOTHING`,
      [u.id, u.name, u.avatar, u.color, u.email, demoHash]
    );
  }

  const projectId = 'proj-1';
  await pool.query(
    `INSERT INTO projects (id, key, name, description, lead_id, type)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [projectId, 'ACME', 'ACME Platform', 'Core platform product', 'u1', 'software']
  );

  const sprintId = 'sprint-1';
  await pool.query(
    `INSERT INTO sprints (id, project_id, name, goal, start_date, end_date, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [sprintId, projectId, 'Sprint 12', 'Ship the new onboarding flow and fix critical bugs',
     '2025-06-02', '2025-06-13', true]
  );

  const issues = [
    { id: 'i1',  key: 'ACME-1',  type: 'epic',    title: 'Onboarding Flow Redesign',              desc: 'Complete overhaul of the user onboarding experience.',                               priority: 'highest', status: 'in-progress', assignee: 'u1', reporter: 'u1', points: 21, labels: ['ux','frontend'],      epicKey: null },
    { id: 'i2',  key: 'ACME-2',  type: 'story',   title: 'Welcome screen with animated walkthrough', desc: 'Design and implement animated welcome carousel for new users.',                    priority: 'high',    status: 'in-progress', assignee: 'u2', reporter: 'u1', points: 8,  labels: ['frontend','animation'], epicKey: 'ACME-1' },
    { id: 'i3',  key: 'ACME-3',  type: 'task',    title: 'Profile completion checklist widget',   desc: 'Build a progress widget showing profile completion percentage.',                      priority: 'medium',  status: 'todo',        assignee: 'u3', reporter: 'u1', points: 5,  labels: ['frontend'],            epicKey: 'ACME-1' },
    { id: 'i4',  key: 'ACME-4',  type: 'bug',     title: 'Login loop on Safari 17 mobile',       desc: 'Users are stuck in redirect loop after OAuth on Safari iOS 17.',                     priority: 'highest', status: 'in-review',   assignee: 'u4', reporter: 'u2', points: 3,  labels: ['auth','critical'],      epicKey: null },
    { id: 'i5',  key: 'ACME-5',  type: 'task',    title: 'Migrate PostgreSQL to v16',             desc: 'Upgrade database cluster from v14 to v16 with zero-downtime migration.',             priority: 'high',    status: 'todo',        assignee: 'u5', reporter: 'u1', points: 13, labels: ['backend','infra'],      epicKey: null },
    { id: 'i6',  key: 'ACME-6',  type: 'story',   title: 'Dark mode support across all views',   desc: 'Implement system-wide dark mode using CSS variables and Tailwind config.',            priority: 'medium',  status: 'backlog',     assignee: 'u2', reporter: 'u3', points: 8,  labels: ['ux','frontend'],       epicKey: null },
    { id: 'i7',  key: 'ACME-7',  type: 'bug',     title: 'Memory leak in WebSocket handler',     desc: 'Event listeners are not cleaned up on component unmount causing memory leak.',        priority: 'high',    status: 'in-progress', assignee: 'u1', reporter: 'u4', points: 5,  labels: ['backend','performance'],epicKey: null },
    { id: 'i8',  key: 'ACME-8',  type: 'task',    title: 'GraphQL schema federation setup',      desc: 'Configure Apollo Federation gateway for microservices architecture.',                  priority: 'medium',  status: 'backlog',     assignee: 'u3', reporter: 'u1', points: 13, labels: ['backend','api'],        epicKey: null },
    { id: 'i9',  key: 'ACME-9',  type: 'story',   title: 'Email notification digest system',     desc: 'Build daily/weekly digest emails for user activity with unsubscribe flow.',           priority: 'low',     status: 'backlog',     assignee: 'u5', reporter: 'u2', points: 8,  labels: ['backend','email'],      epicKey: null },
    { id: 'i10', key: 'ACME-10', type: 'task',    title: 'WCAG 2.1 AA accessibility audit',      desc: 'Perform full accessibility audit and fix all critical issues.',                       priority: 'high',    status: 'done',        assignee: 'u2', reporter: 'u1', points: 5,  labels: ['a11y','frontend'],     epicKey: null },
    { id: 'i11', key: 'ACME-11', type: 'bug',     title: 'CSV export truncates rows >10k',       desc: 'Export functionality fails silently when dataset exceeds 10,000 rows.',               priority: 'medium',  status: 'done',        assignee: 'u4', reporter: 'u3', points: 3,  labels: ['backend','data'],      epicKey: null },
    { id: 'i12', key: 'ACME-12', type: 'story',   title: 'Two-factor authentication (TOTP)',     desc: 'Add TOTP-based 2FA with QR code setup, backup codes, and recovery flow.',           priority: 'highest', status: 'done',        assignee: 'u1', reporter: 'u1', points: 13, labels: ['auth','security'],     epicKey: null },
    { id: 'i13', key: 'ACME-13', type: 'subtask', title: 'Write unit tests for auth middleware', desc: 'Cover all edge cases in JWT validation middleware with Jest.',                        priority: 'medium',  status: 'done',        assignee: 'u3', reporter: 'u1', points: 3,  labels: ['testing','backend'],   epicKey: null },
    { id: 'i14', key: 'ACME-14', type: 'task',    title: 'Rate limiting on public API endpoints',desc: 'Implement sliding window rate limiter on all unauthenticated endpoints.',             priority: 'high',    status: 'in-review',   assignee: 'u5', reporter: 'u2', points: 5,  labels: ['security','backend'],  epicKey: null },
  ];

  for (let i = 0; i < issues.length; i++) {
    const iss = issues[i];
    await pool.query(
      `INSERT INTO issues (id, key, project_id, sprint_id, type, title, description, priority, status,
        assignee_id, reporter_id, story_points, epic_key, labels, board_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING`,
      [iss.id, iss.key, projectId, sprintId, iss.type, iss.title, iss.desc,
       iss.priority, iss.status, iss.assignee, iss.reporter, iss.points,
       iss.epicKey, iss.labels, i]
    );
  }

  // Sample comments
  const comments = [
    { id: randomUUID(), issueId: 'i4', authorId: 'u4', body: 'Reproduced consistently on iPhone 14 + Safari 17.2. JWT token is valid but redirect loops.' },
    { id: randomUUID(), issueId: 'i4', authorId: 'u2', body: 'Looks like a SameSite cookie issue. Setting SameSite=None;Secure should fix it.' },
    { id: randomUUID(), issueId: 'i4', authorId: 'u1', body: 'Fix deployed to staging. QA please verify.' },
    { id: randomUUID(), issueId: 'i7', authorId: 'u1', body: 'Confirmed — socket.on event handlers are not removed in useEffect cleanup.' },
    { id: randomUUID(), issueId: 'i7', authorId: 'u3', body: 'PR #847 up for review. Added comprehensive cleanup logic.' },
    { id: randomUUID(), issueId: 'i2', authorId: 'u2', body: 'Figma designs approved. Starting implementation.' },
    { id: randomUUID(), issueId: 'i12', authorId: 'u1', body: 'Released in v3.4.0. All backup code flows tested.' },
  ];

  for (const c of comments) {
    await pool.query(
      'INSERT INTO comments (id, issue_id, author_id, body) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [c.id, c.issueId, c.authorId, c.body]
    );
  }

  // Confluence spaces
  const spaces = [
    { id: 'space-1', key: 'ENG',  name: 'Engineering',       desc: 'Architecture, RFCs, runbooks, and technical documentation.',    emoji: '⚙️',  color: '#0052CC' },
    { id: 'space-2', key: 'PROD', name: 'Product',           desc: 'Roadmaps, PRDs, feature specs, and OKRs.',                     emoji: '🚀',  color: '#00875A' },
    { id: 'space-3', key: 'HR',   name: 'People & Culture',  desc: 'Handbook, policies, onboarding guides, and team rituals.',     emoji: '🤝',  color: '#6554C0' },
  ];

  for (const s of spaces) {
    await pool.query(
      `INSERT INTO confluence_spaces (id, key, name, description, emoji, color)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [s.id, s.key, s.name, s.desc, s.emoji, s.color]
    );
  }

  const pages = [
    {
      id: 'p1', spaceId: 'space-1', title: 'System Architecture Overview', emoji: '🏗️',
      tags: ['architecture','backend'], authorId: 'u1',
      content: `# System Architecture Overview

## Introduction
This document describes the high-level architecture of the ACME Platform, a cloud-native SaaS application serving over 50,000 organizations worldwide.

## Architecture Principles
- **Resilience first**: Every service is designed to degrade gracefully
- **API-first**: All functionality exposed via versioned REST/GraphQL APIs
- **Observability**: Metrics, logs, and traces on every service
- **Zero-trust security**: mTLS between all internal services

## Core Services

### API Gateway
Handles authentication, rate limiting, and request routing. Built on Kong with custom plugins.

### Application Layer
| Service | Language | Replicas | SLA |
|---------|----------|----------|-----|
| auth-service | Go | 3 | 99.99% |
| user-service | Node.js | 5 | 99.9% |
| billing-service | Python | 2 | 99.9% |
| notification-service | Node.js | 3 | 99.5% |

### Data Layer
- **PostgreSQL 16** (primary + 2 read replicas) for transactional data
- **Redis 7** for caching and session storage
- **S3-compatible** object storage for attachments

## Deployment
All services deployed on Kubernetes (EKS). GitOps with ArgoCD. Blue-green deployments with automated rollback.

\`\`\`yaml
# Example service deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
\`\`\`
`
    },
    {
      id: 'p2', spaceId: 'space-1', title: 'API Design Guidelines', emoji: '📡',
      tags: ['api','standards'], authorId: 'u2',
      content: `# API Design Guidelines

## Versioning
All APIs are versioned via URL path: \`/api/v1/resource\`

## REST Conventions
- Use **nouns** for resource names, not verbs
- HTTP methods map to CRUD operations
- Return appropriate status codes

| Method | Action | Success Code |
|--------|--------|--------------|
| GET | Read | 200 |
| POST | Create | 201 |
| PUT | Replace | 200 |
| PATCH | Update | 200 |
| DELETE | Delete | 204 |

## Error Format
All errors follow RFC 7807 Problem Details:

\`\`\`json
{
  "type": "https://api.acme.com/errors/validation",
  "title": "Validation Failed",
  "status": 422,
  "detail": "The email field is required",
  "errors": [{ "field": "email", "message": "Required" }]
}
\`\`\`

## Authentication
All endpoints require \`Authorization: Bearer <token>\` except public health endpoints.
`
    },
    {
      id: 'p3', spaceId: 'space-1', title: 'Incident Runbook: Database Failover', emoji: '🚨',
      tags: ['runbook','ops','database'], authorId: 'u5',
      content: `# Incident Runbook: Database Failover

## Severity: P0 — Immediate Action Required

## Detection
Alert fires when: primary DB replication lag > 30s OR connection pool exhausted > 2min

## Runbook Steps

### Step 1: Verify the incident
\`\`\`bash
# Check replication status
psql -h primary.db.internal -U admin -c "SELECT * FROM pg_stat_replication;"

# Check connection counts
psql -c "SELECT count(*) FROM pg_stat_activity;"
\`\`\`

### Step 2: Initiate failover
\`\`\`bash
# Promote replica to primary
pg_ctl promote -D /var/lib/postgresql/16/main

# Update connection string in AWS Secrets Manager
aws secretsmanager update-secret --secret-id prod/db/url \\
  --secret-string "postgresql://admin:pass@replica1.db:5432/acme"
\`\`\`

### Step 3: Notify stakeholders
- Page on-call DBA via PagerDuty
- Post in #incidents Slack channel
- Update status page within 5 minutes

## Post-Incident
- RCA within 24 hours
- Blameless postmortem within 48 hours
`
    },
    {
      id: 'p4', spaceId: 'space-2', title: 'Product Roadmap Q3 2025', emoji: '🗺️',
      tags: ['roadmap','strategy'], authorId: 'u3',
      content: `# Product Roadmap — Q3 2025

## Vision
*"Make ACME the most developer-friendly collaboration platform in the market."*

## Themes

### 🚀 Theme 1: Developer Experience
**Goal**: Reduce time-to-first-API-call from 30min to under 5min

- Interactive API playground in docs
- One-click sandbox environment
- SDK for Python, JS, Go, Ruby

### 📊 Theme 2: Analytics & Insights
**Goal**: Give teams real-time visibility into their work patterns

- Sprint velocity burndown charts
- Cycle time heatmaps
- Team capacity planning

### 🔐 Theme 3: Enterprise Security
**Goal**: Achieve SOC2 Type II compliance

- Audit log streaming to SIEM
- IP allowlisting per workspace
- SSO/SAML improvements

## Milestones

| Week | Milestone | Owner |
|------|-----------|-------|
| W1-W2 | API playground beta | u2 |
| W3-W4 | Analytics dashboard v1 | u3 |
| W5-W6 | SOC2 control implementation | u5 |
| W7-W8 | Public beta launch | u1 |

## Success Metrics
- Developer signup → first API call: < 5 min *(from 32 min)*
- NPS score: > 45 *(from 31)*
- Enterprise deals influenced: 15+
`
    },
    {
      id: 'p5', spaceId: 'space-2', title: 'Feature Spec: Notification Digest', emoji: '📬',
      tags: ['feature','notifications'], authorId: 'u3',
      content: `# Feature Spec: Notification Digest

## Problem Statement
Users are overwhelmed by real-time notifications. 68% of users disable all email notifications within the first week.

## Proposed Solution
A smart digest system that batches notifications into daily or weekly summaries, with AI-powered prioritization.

## User Stories
- As a user, I want to receive a daily summary of activity in my projects
- As a user, I want to configure digest frequency (never, daily, weekly)
- As a user, I want to unsubscribe with one click from any digest email

## Technical Design

### Digest Generation
\`\`\`
Every night at 8PM user local time:
1. Query events from last 24h for user
2. Score events by relevance (assigned, mentioned, commented)
3. Group by project and priority
4. Render email template
5. Send via SendGrid
\`\`\`

## Acceptance Criteria
- [ ] User can configure digest in Settings > Notifications
- [ ] Digest emails render correctly in Gmail, Outlook, Apple Mail
- [ ] One-click unsubscribe works without login
- [ ] Delivery rate > 99.5%
`
    },
    {
      id: 'p6', spaceId: 'space-3', title: 'Engineering Team Handbook', emoji: '📘',
      tags: ['handbook','culture','engineering'], authorId: 'u1',
      content: `# Engineering Team Handbook

## Our Values
1. **Ship with quality** — We do not sacrifice long-term health for short-term speed
2. **Own your work** — Every engineer is responsible for their code in production
3. **Default to async** — We respect deep work and avoid unnecessary meetings
4. **Blameless culture** — Incidents are learning opportunities, not witch hunts

## Working Hours
We are a remote-first team spanning CET, EST, and PST. Core overlap hours are **14:00–17:00 CET**.

## Communication
- **Slack** for async comms (respond within 4h during core hours)
- **Notion/Confluence** for documentation (write decisions, don't just discuss them)
- **GitHub** for code review (2 approvals required for main branch)

## On-Call Rotation
All senior engineers participate in a weekly on-call rotation.

| Week | Primary | Secondary |
|------|---------|-----------|
| Jun 2 | Alice | Bob |
| Jun 9 | Clara | David |
| Jun 16 | Eva | Alice |

## Code Review Standards
- PRs should be < 400 lines (prefer smaller, more frequent PRs)
- Link to issue in PR description
- All CI checks must pass before review
- No self-merging (exception: hotfixes with post-merge review)
`
    },
  ];

  for (const p of pages) {
    await pool.query(
      `INSERT INTO confluence_pages (id, space_id, title, content, author_id, emoji, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [p.id, p.spaceId, p.title, p.content, p.authorId, p.emoji, p.tags]
    );
  }

  logger.info('Database seeded successfully');
}

seed()
  .then(() => pool.end())
  .catch((err) => { logger.error(err); process.exit(1); });
