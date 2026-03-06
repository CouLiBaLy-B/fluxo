import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { pool } from '../db/pool';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import logger from '../logger';

const router = Router();

// Toutes les routes issues nécessitent une authentification
router.use(requireAuth);

// ── Types ──────────────────────────────────────────────────────────────────────

interface IssueRow {
  id: string;
  key: string;
  project_id: string;
  sprint_id: string | null;
  type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  assignee_color: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  story_points: number;
  labels: string[];
  epic_key: string | null;
  board_order: number;
  comments: unknown[];
  created_at: Date;
  updated_at: Date;
}

function formatIssue(row: IssueRow) {
  return {
    id: row.id,
    key: row.key,
    projectId: row.project_id,
    sprintId: row.sprint_id ?? null,
    type: row.type,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    assigneeId: row.assignee_id ?? null,
    assigneeName: row.assignee_name ?? null,
    assigneeAvatar: row.assignee_avatar ?? null,
    assigneeColor: row.assignee_color ?? null,
    reporterId: row.reporter_id ?? null,
    reporterName: row.reporter_name ?? null,
    storyPoints: row.story_points,
    labels: row.labels ?? [],
    epicKey: row.epic_key ?? null,
    boardOrder: row.board_order,
    comments: row.comments ?? [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

// Requête commune pour récupérer une issue avec ses commentaires et les infos utilisateurs
const ISSUE_WITH_COMMENTS_QUERY = `
  SELECT
    i.id, i.key, i.project_id, i.sprint_id, i.type, i.title, i.description,
    i.priority, i.status, i.assignee_id, i.reporter_id, i.story_points,
    i.labels, i.epic_key, i.board_order, i.created_at, i.updated_at,
    ua.name AS assignee_name, ua.avatar AS assignee_avatar, ua.color AS assignee_color,
    ur.name AS reporter_name,
    COALESCE(
      json_agg(
        json_build_object(
          'id',        c.id,
          'authorId',  c.author_id,
          'body',      c.body,
          'createdAt', to_char(c.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ) ORDER BY c.created_at ASC
      ) FILTER (WHERE c.id IS NOT NULL),
      '[]'::json
    ) AS comments
  FROM issues i
  LEFT JOIN users ua   ON ua.id = i.assignee_id
  LEFT JOIN users ur   ON ur.id = i.reporter_id
  LEFT JOIN comments c ON c.issue_id = i.id
`;

// ── GET /api/issues ────────────────────────────────────────────────────────────
/** Liste les issues avec filtres optionnels. */
router.get(
  '/',
  [
    query('projectId').optional().isString(),
    query('sprintId').optional().isString(),
    query('status').optional().isString(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, sprintId, status } = req.query;
      const conditions: string[] = ['i.deleted_at IS NULL'];
      const params: unknown[] = [];

      if (projectId) { conditions.push(`i.project_id = $${params.length + 1}`); params.push(projectId); }
      if (sprintId === 'backlog') {
        conditions.push('i.sprint_id IS NULL');
      } else if (sprintId) {
        conditions.push(`i.sprint_id = $${params.length + 1}`);
        params.push(sprintId);
      }
      if (status) { conditions.push(`i.status = $${params.length + 1}`); params.push(status); }

      const where = `WHERE ${conditions.join(' AND ')}`;

      const { rows } = await pool.query<IssueRow>(
        `${ISSUE_WITH_COMMENTS_QUERY}
         ${where}
         GROUP BY i.id, ua.name, ua.avatar, ua.color, ur.name
         ORDER BY i.board_order ASC, i.created_at ASC`,
        params
      );

      res.json(rows.map(formatIssue));
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/issues/:id ────────────────────────────────────────────────────────
router.get(
  '/:id',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query<IssueRow>(
        `${ISSUE_WITH_COMMENTS_QUERY}
         WHERE i.id = $1 AND i.deleted_at IS NULL
         GROUP BY i.id, ua.name, ua.avatar, ua.color, ur.name`,
        [req.params.id]
      );
      if (!rows[0]) throw new AppError(404, 'Issue introuvable');
      res.json(formatIssue(rows[0]));
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/issues ───────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('projectId').notEmpty().withMessage('Le projet est obligatoire'),
    body('title').trim().notEmpty().withMessage('Le titre est obligatoire')
      .isLength({ max: 255 }).withMessage('Le titre ne peut pas dépasser 255 caractères'),
    body('type').optional().isIn(['story', 'bug', 'task', 'epic', 'subtask']),
    body('priority').optional().isIn(['lowest', 'low', 'medium', 'high', 'highest']),
    body('status').optional().isIn(['backlog', 'todo', 'in-progress', 'in-review', 'done']),
    body('storyPoints').optional().isInt({ min: 0, max: 100 }).withMessage('Story points doit être entre 0 et 100'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        projectId, sprintId, type = 'task', title, description = '',
        priority = 'medium', status = 'todo', assigneeId, reporterId,
        storyPoints = 0, labels = [], epicKey,
      } = req.body as {
        projectId: string; sprintId?: string; type?: string;
        title: string; description?: string; priority?: string; status?: string;
        assigneeId?: string; reporterId?: string; storyPoints?: number;
        labels?: string[]; epicKey?: string;
      };

      // Vérifier que le projet existe et récupérer sa clé pour générer la clé d'issue
      const projectRow = await pool.query<{ key: string }>(
        'SELECT key FROM projects WHERE id = $1',
        [projectId]
      );
      if (!projectRow.rowCount) throw new AppError(404, 'Projet introuvable');

      const projectKey = projectRow.rows[0].key;

      // Générer une clé unique : PROJ-N (N = prochain numéro disponible)
      const countRow = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM issues WHERE key LIKE $1`,
        [`${projectKey}-%`]
      );
      const nextNum = parseInt(countRow.rows[0].cnt, 10) + 1;
      const key = `${projectKey}-${nextNum}`;

      const { rows } = await pool.query<IssueRow>(
        `INSERT INTO issues
           (key, project_id, sprint_id, type, title, description, priority, status,
            assignee_id, reporter_id, story_points, labels, epic_key, board_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                 (SELECT COALESCE(MAX(board_order), 0) + 10 FROM issues WHERE project_id = $2 AND deleted_at IS NULL))
         RETURNING *,
                   NULL::text AS assignee_name, NULL::text AS assignee_avatar,
                   NULL::text AS assignee_color, NULL::text AS reporter_name,
                   '[]'::json AS comments`,
        [key, projectId, sprintId ?? null, type, title, description, priority, status,
         assigneeId ?? null, reporterId ?? null, storyPoints, labels, epicKey ?? null]
      );

      logger.info('Issue créée', { issueId: rows[0].id, key, projectId });
      return res.status(201).json(formatIssue(rows[0]));
    } catch (err) {
      return next(err);
    }
  }
);

// ── PUT /api/issues/:id ────────────────────────────────────────────────────────
/** Mise à jour complète d'une issue (dans une transaction). */
router.put(
  '/:id',
  [
    param('id').notEmpty(),
    body('title').trim().notEmpty().withMessage('Le titre est obligatoire')
      .isLength({ max: 255 }),
    body('type').optional().isIn(['story', 'bug', 'task', 'epic', 'subtask']),
    body('priority').optional().isIn(['lowest', 'low', 'medium', 'high', 'highest']),
    body('status').optional().isIn(['backlog', 'todo', 'in-progress', 'in-review', 'done']),
    body('storyPoints').optional().isInt({ min: 0, max: 100 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      const {
        title, description, type, priority, status, assigneeId,
        reporterId, storyPoints, labels, epicKey, sprintId,
      } = req.body as {
        title: string; description?: string; type?: string; priority?: string;
        status?: string; assigneeId?: string; reporterId?: string;
        storyPoints?: number; labels?: string[]; epicKey?: string; sprintId?: string;
      };

      await client.query('BEGIN');

      const { rows, rowCount } = await client.query<IssueRow>(
        `UPDATE issues SET
           title=$1, description=$2, type=$3, priority=$4, status=$5,
           assignee_id=$6, reporter_id=$7, story_points=$8, labels=$9,
           epic_key=$10, sprint_id=$11
         WHERE id=$12 AND deleted_at IS NULL
         RETURNING *,
                   NULL::text AS assignee_name, NULL::text AS assignee_avatar,
                   NULL::text AS assignee_color, NULL::text AS reporter_name,
                   '[]'::json AS comments`,
        [title, description ?? '', type ?? 'task', priority ?? 'medium', status ?? 'todo',
         assigneeId ?? null, reporterId ?? null, storyPoints ?? 0, labels ?? [], epicKey ?? null,
         sprintId ?? null, req.params.id]
      );

      if (!rowCount) throw new AppError(404, 'Issue introuvable');

      // Récupérer avec les commentaires et utilisateurs
      const { rows: full } = await client.query<IssueRow>(
        `${ISSUE_WITH_COMMENTS_QUERY}
         WHERE i.id = $1 AND i.deleted_at IS NULL
         GROUP BY i.id, ua.name, ua.avatar, ua.color, ur.name`,
        [rows[0].id]
      );

      await client.query('COMMIT');

      res.json(formatIssue(full[0]));
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  }
);

// ── PATCH /api/issues/:id/status ───────────────────────────────────────────────
/** Mise à jour rapide du statut (utilisée par le Kanban drag & drop). */
router.patch(
  '/:id/status',
  [
    param('id').notEmpty(),
    body('status').notEmpty()
      .isIn(['backlog', 'todo', 'in-progress', 'in-review', 'done']).withMessage('Statut invalide'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rowCount } = await pool.query(
        'UPDATE issues SET status = $1 WHERE id = $2 AND deleted_at IS NULL',
        [req.body.status, req.params.id]
      );
      if (!rowCount) throw new AppError(404, 'Issue introuvable');
      res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  }
);

// ── PATCH /api/issues/reorder ──────────────────────────────────────────────────
/**
 * Réordonnancement des issues après un drag & drop.
 * Accepte un tableau d'objets { id, boardOrder, status }.
 */
router.patch(
  '/reorder',
  [
    body('items').isArray({ min: 1 }).withMessage('items doit être un tableau non vide'),
    body('items.*.id').notEmpty().withMessage('Chaque item doit avoir un id'),
    body('items.*.boardOrder').isInt({ min: 0 }).withMessage('boardOrder doit être un entier positif'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      const items = req.body.items as { id: string; boardOrder: number; status?: string }[];

      await client.query('BEGIN');

      for (const item of items) {
        if (item.status) {
          await client.query(
            'UPDATE issues SET board_order = $1, status = $2 WHERE id = $3 AND deleted_at IS NULL',
            [item.boardOrder, item.status, item.id]
          );
        } else {
          await client.query(
            'UPDATE issues SET board_order = $1 WHERE id = $2 AND deleted_at IS NULL',
            [item.boardOrder, item.id]
          );
        }
      }

      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  }
);

// ── DELETE /api/issues/:id ─────────────────────────────────────────────────────
/** Soft delete : marque l'issue comme supprimée sans la retirer de la DB. */
router.delete(
  '/:id',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rowCount } = await pool.query(
        'UPDATE issues SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
        [req.params.id]
      );
      if (!rowCount) throw new AppError(404, 'Issue introuvable');
      logger.info('Issue supprimée (soft delete)', { issueId: req.params.id });
      res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/issues/:id/comments ──────────────────────────────────────────────
router.post(
  '/:id/comments',
  [
    param('id').notEmpty(),
    body('body').trim().notEmpty().withMessage('Le contenu du commentaire est obligatoire')
      .isLength({ max: 2000 }).withMessage('Le commentaire ne peut pas dépasser 2000 caractères'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Vérifier que l'issue existe
      const issueCheck = await pool.query<{ id: string }>(
        'SELECT id FROM issues WHERE id = $1 AND deleted_at IS NULL',
        [req.params.id]
      );
      if (!issueCheck.rowCount) throw new AppError(404, 'Issue introuvable');

      const { rows } = await pool.query<{
        id: string; author_id: string; body: string; created_at: Date
      }>(
        `INSERT INTO comments (issue_id, author_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, author_id, body, created_at`,
        [req.params.id, req.user!.userId, req.body.body.trim()]
      );

      res.status(201).json({
        id: rows[0].id,
        authorId: rows[0].author_id,
        body: rows[0].body,
        createdAt: rows[0].created_at.toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
