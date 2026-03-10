<div align="center">
  <img src="src/logo/logo_global.png" alt="Fluxo" width="480" />
  <br/><br/>

  <h1>Fluxo</h1>

  <p><strong>Plateforme de gestion de projet agile et de documentation collaborative</strong></p>
  <p>Combinez la puissance de <strong>FLUXO PLAN</strong> (Kanban / Sprints) et <strong>FLUXO DOC</strong> (Wiki collaboratif) dans une seule application.</p>

  <br/>

  ![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
  ![Node.js](https://img.shields.io/badge/Node.js_20-339933?logo=node.js&logoColor=white)
  ![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-4169E1?logo=postgresql&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
  ![React](https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=black)

</div>

---

## Les modules Fluxo

<div align="center">
  <table>
    <tr>
      <td align="center" width="50%">
        <img src="src/logo/logo_fluxo_plan.png" alt="Fluxo Plan" width="320" />
        <br/>
        <strong>Gestion de projet agile</strong><br/>
        <sub>Kanban · Sprints · Issues · Drag &amp; Drop</sub>
      </td>
      <td align="center" width="50%">
        <img src="src/logo/logo_fluxo_doc.png" alt="Fluxo Doc" width="320" />
        <br/>
        <strong>Documentation collaborative</strong><br/>
        <sub>Wiki · Éditeur riche · Pages · Espaces</sub>
      </td>
    </tr>
  </table>
</div>

---

## Fonctionnalités

### FLUXO PLAN — Gestion de projet

- **Tableaux Kanban** avec drag & drop multi-colonnes
- **Sprints** avec dates, objectifs et suivi de progression
- **Issues** typées (Story, Task, Bug, Epic) avec priorités, labels, story points
- **Backlog** avec réorganisation par glisser-déposer
- **Assignation** et suivi par membre d'équipe
- **Commentaires** sur les issues en temps réel

### FLUXO DOC — Documentation

- **Éditeur riche** (TipTap) — titres, tableaux, blocs de code, liens, listes
- **Espaces** de documentation organisés par équipe ou projet
- **Pages hiérarchiques** avec table des matières automatique
- **Commandes slash** (`/heading`, `/table`, `/code`…)
- **Auto-sauvegarde** pendant la frappe

### Intelligence artificielle intégrée

- **Agents AI** (Developer, QA, Writer, Researcher, Architect)
- **Orchestrateur de tâches** avec file d'attente et retry automatique
- **Sandbox isolé** — Claude Code en mode headless pour générer du code
- **Multi-provider LLM** : Mock · OpenAI · Anthropic · Ollama (local)
- **Création automatique de pages** Confluence à partir des issues

### Sécurité & Authentification

- **JWT** avec expiration configurable
- **Bcrypt** pour le hachage des mots de passe (rounds configurables)
- **Rate limiting** global et renforcé sur les endpoints auth
- **Verrouillage de compte** après 10 tentatives échouées (15 min)
- **Gestion des rôles** : Admin / Member
- **Création d'utilisateurs** réservée aux admins

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP / WebSocket
┌───────────────────────────▼─────────────────────────────┐
│              Nginx (port 80)                            │
│   React SPA + Reverse proxy → /api & /ws               │
└────────────┬──────────────────────────┬─────────────────┘
             │ /api/*                   │ /ws
┌────────────▼──────────────────────────▼─────────────────┐
│          Backend Node.js (port 4000)                    │
│   Express REST API · WebSocket · Orchestrateur agents   │
└────┬──────────────────────┬───────────────────┬─────────┘
     │                      │                   │
┌────▼────┐          ┌──────▼──────┐   ┌────────▼────────┐
│PostgreSQL│          │   Ollama    │   │  Dev Sandbox    │
│  :5432   │          │  LLM local  │   │  Claude Code    │
└─────────┘          └─────────────┘   └─────────────────┘
```

| Service         | Technologie              | Rôle                                 |
| --------------- | ------------------------ | ------------------------------------ |
| Frontend        | React 19 + Vite + Nginx  | Interface utilisateur                |
| Backend         | Node.js 20 + Express     | API REST + WebSocket                 |
| Base de données | PostgreSQL 16            | Persistance des données              |
| LLM local       | Ollama                   | Inférence IA locale                  |
| Sandbox         | Claude Code (headless)   | Exécution des tâches AI              |

---

## Installation rapide

### Option 1 — Script automatique (recommandé)

```bash
git clone <url-du-depot> fluxo && cd fluxo
bash install.sh
```

Le script `install.sh` guide pas à pas : vérification des prérequis, configuration du `.env`, choix du fournisseur LLM, démarrage Docker et vérification de santé.

### Option 2 — Manuelle

```bash
# 1. Cloner
git clone <url-du-depot> fluxo && cd fluxo

# 2. Configurer
cp .env.example .env
# Éditez .env : POSTGRES_PASSWORD, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD

# 3. Démarrer
docker compose up --build -d

# 4. Ouvrir
open http://localhost
```

Pour la configuration complète (LLM, GPU, développement local…) :

**[Consulter le guide d'installation complet → INSTALL.md](INSTALL.md)**

---

## Stack technique

| Couche              | Technologies                                                  |
| ------------------- | ------------------------------------------------------------- |
| **Frontend**        | React 19, TypeScript, Vite, Tailwind CSS 4, React Query      |
| **Éditeur**         | TipTap 2 (ProseMirror) — tables, code, liens, slash commands |
| **Drag & Drop**     | @dnd-kit/core + @dnd-kit/sortable                             |
| **Backend**         | Node.js 20, Express 4, TypeScript                             |
| **Base de données** | PostgreSQL 16, driver `pg`                                    |
| **Auth**            | JWT (jsonwebtoken), bcryptjs                                  |
| **Sécurité**        | Helmet, CORS, express-rate-limit, express-validator           |
| **Temps réel**      | WebSocket (ws)                                                |
| **LLM**             | Anthropic SDK, OpenAI SDK, Ollama                             |
| **Logging**         | Winston (structuré) + Morgan (HTTP)                           |
| **Infra**           | Docker, Docker Compose, Nginx                                 |

---

<div align="center">
  <img src="src/logo/logo_global.png" alt="Fluxo" width="200" />
  <br/>
  <sub>Fluxo — L'application globale · Construit avec ❤️</sub>
</div>
