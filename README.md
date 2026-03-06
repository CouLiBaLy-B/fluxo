# Atlassian Clone — Jira + Confluence

A production-ready Atlassian workspace clone with **Jira** (project & board management) and **Confluence** (wiki), fully dockerised.

---

## 🚀 Quick Start (Docker)

```bash
# 1. Clone the repo
git clone <your-repo>
cd <your-repo>

# 2. Copy environment variables
cp .env.example .env

# 3. Build and start all services
docker compose up --build

# 4. Open in browser
open http://localhost
```

The stack:
| Service   | Port | Description              |
|-----------|------|--------------------------|
| frontend  | 80   | React SPA via Nginx      |
| backend   | 4000 | Express REST API         |
| postgres  | 5432 | PostgreSQL 16            |

---

## 🛠 Local Development (no Docker)

### Frontend
```bash
npm install
npm run dev        # http://localhost:5173
```

### Backend
```bash
cd backend
npm install
# Set DATABASE_URL in .env or environment
npm run dev        # http://localhost:4000
```

---

## 📦 Architecture

```
.
├── src/                  # React frontend (Vite + Tailwind)
│   ├── components/
│   │   ├── JiraBoard.tsx       # Kanban board with DnD
│   │   ├── ProjectsPage.tsx    # Project list / create / edit
│   │   └── ConfluenceWiki.tsx  # Wiki editor
│   ├── types.ts
│   ├── data.ts           # Seed / default data
│   └── App.tsx
├── backend/              # Node.js + Express + TypeScript
│   └── src/
│       ├── routes/
│       │   ├── projects.ts   # CRUD projects
│       │   ├── issues.ts     # CRUD issues
│       │   ├── confluence.ts # CRUD spaces + pages
│       │   └── users.ts
│       └── db/
│           ├── pool.ts
│           └── init.sql      # Schema + seed data
├── Dockerfile            # Frontend multi-stage build
├── nginx.conf            # Nginx SPA + API proxy config
├── docker-compose.yml    # Full stack orchestration
└── .env.example
```

---

## 🔌 API Reference

### Projects
| Method | Endpoint                       | Description          |
|--------|--------------------------------|----------------------|
| GET    | /api/projects                  | List all projects    |
| POST   | /api/projects                  | Create a project     |
| GET    | /api/projects/:id              | Get one project      |
| PUT    | /api/projects/:id              | Update a project     |
| DELETE | /api/projects/:id              | Delete a project     |
| GET    | /api/projects/:id/issues       | Issues by project    |
| GET    | /api/projects/:id/sprints      | Sprints by project   |

### Issues
| Method | Endpoint                       | Description          |
|--------|--------------------------------|----------------------|
| GET    | /api/issues                    | List / search issues |
| POST   | /api/issues                    | Create an issue      |
| GET    | /api/issues/:id                | Get one issue        |
| PUT    | /api/issues/:id                | Update an issue      |
| PATCH  | /api/issues/:id/status         | Move on board        |
| DELETE | /api/issues/:id                | Delete an issue      |
| POST   | /api/issues/:id/comments       | Add a comment        |

### Confluence
| Method | Endpoint                          | Description        |
|--------|-----------------------------------|--------------------|
| GET    | /api/confluence/spaces            | List spaces        |
| POST   | /api/confluence/spaces            | Create a space     |
| GET    | /api/confluence/spaces/:key/pages | Pages in a space   |
| POST   | /api/confluence/pages             | Create a page      |
| PUT    | /api/confluence/pages/:id         | Update a page      |
| DELETE | /api/confluence/pages/:id         | Delete a page      |
