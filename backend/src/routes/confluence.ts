import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { pool } from '../db/pool';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import logger from '../logger';

const router = Router();

router.use(requireAuth);

// ── Types ──────────────────────────────────────────────────────────────────────

interface PageRow {
  id: string;
  space_id: string;
  space_key: string;
  parent_id: string | null;
  title: string;
  content: string;
  author_id: string | null;
  author_name?: string | null;
  tags: string[];
  emoji: string;
  likes: number;
  views: number;
  created_at: Date;
  updated_at: Date;
}

interface SpaceRow {
  id: string;
  key: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  owner_id: string | null;
  created_at: Date;
}

function formatPage(row: PageRow) {
  return {
    id: row.id,
    spaceId: row.space_id,
    spaceKey: row.space_key,
    parentId: row.parent_id ?? null,
    title: row.title,
    content: row.content,
    authorId: row.author_id ?? null,
    authorName: row.author_name ?? null,
    tags: row.tags ?? [],
    emoji: row.emoji,
    likes: row.likes,
    views: row.views,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function formatSpace(row: SpaceRow, pages: ReturnType<typeof formatPage>[]) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    emoji: row.emoji,
    color: row.color,
    ownerId: row.owner_id ?? null,
    pages,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

// ── GET /api/confluence/spaces ──────────────────────────────────────────────────
/** Liste tous les espaces avec leurs pages (non supprimées). */
router.get('/spaces', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows: spaces } = await pool.query<SpaceRow>(
      'SELECT * FROM confluence_spaces ORDER BY name ASC'
    );
    const { rows: pages } = await pool.query<PageRow>(
      `SELECT p.*, u.name AS author_name
       FROM confluence_pages p
       LEFT JOIN users u ON u.id = p.author_id
       WHERE p.deleted_at IS NULL
       ORDER BY p.created_at ASC`
    );

    const result = spaces.map((s) =>
      formatSpace(s, pages.filter((p) => p.space_id === s.id).map(formatPage))
    );
    res.json(result);
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/confluence/spaces ─────────────────────────────────────────────────
router.post(
  '/spaces',
  [
    body('key').trim().notEmpty().withMessage('La clé est obligatoire')
      .toUpperCase()
      .matches(/^[A-Z][A-Z0-9]{1,9}$/).withMessage('Clé invalide (ex: ENG, PM)'),
    body('name').trim().notEmpty().withMessage('Le nom est obligatoire')
      .isLength({ max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key, name, description = '', emoji = '📁', color = '#0052CC' } = req.body as {
        key: string; name: string; description?: string; emoji?: string; color?: string;
      };

      // Vérifier l'unicité de la clé
      const exists = await pool.query<{ id: string }>(
        'SELECT id FROM confluence_spaces WHERE key = $1',
        [key]
      );
      if (exists.rowCount && exists.rowCount > 0) {
        throw new AppError(409, `La clé d'espace "${key}" est déjà utilisée`);
      }

      const { rows } = await pool.query<SpaceRow>(
        `INSERT INTO confluence_spaces (key, name, description, emoji, color, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [key, name, description, emoji, color, req.user!.userId]
      );

      logger.info('Espace Confluence créé', { spaceId: rows[0].id, key });
      res.status(201).json(formatSpace(rows[0], []));
    } catch (err) {
      return next(err);
    }
  }
);

// ── PUT /api/confluence/spaces/:id ──────────────────────────────────────────────
router.put(
  '/spaces/:id',
  [
    param('id').notEmpty(),
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, emoji, color } = req.body as {
        name: string; description?: string; emoji?: string; color?: string;
      };

      const { rows } = await pool.query<SpaceRow>(
        `UPDATE confluence_spaces SET name=$1, description=$2, emoji=$3, color=$4
         WHERE id=$5
         RETURNING *`,
        [name, description ?? '', emoji ?? '📁', color ?? '#0052CC', req.params.id]
      );

      if (!rows[0]) throw new AppError(404, 'Espace introuvable');

      const { rows: pages } = await pool.query<PageRow>(
        `SELECT p.*, u.name AS author_name
         FROM confluence_pages p
         LEFT JOIN users u ON u.id = p.author_id
         WHERE p.space_id = $1 AND p.deleted_at IS NULL
         ORDER BY p.created_at ASC`,
        [req.params.id]
      );

      res.json(formatSpace(rows[0], pages.map(formatPage)));
    } catch (err) {
      return next(err);
    }
  }
);

// ── DELETE /api/confluence/spaces/:id ───────────────────────────────────────────
router.delete(
  '/spaces/:id',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rowCount } = await pool.query(
        'DELETE FROM confluence_spaces WHERE id = $1',
        [req.params.id]
      );
      if (!rowCount) throw new AppError(404, 'Espace introuvable');
      logger.info('Espace supprimé', { spaceId: req.params.id });
      res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/confluence/spaces/:key/pages ────────────────────────────────────────
router.get(
  '/spaces/:key/pages',
  [param('key').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query<PageRow>(
        `SELECT p.*, u.name AS author_name
         FROM confluence_pages p
         LEFT JOIN users u ON u.id = p.author_id
         WHERE p.space_key = $1 AND p.deleted_at IS NULL
         ORDER BY p.created_at ASC`,
        [req.params.key.toUpperCase()]
      );
      res.json(rows.map(formatPage));
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/confluence/spaces/:key/pages ───────────────────────────────────────
router.post(
  '/spaces/:key/pages',
  [
    param('key').notEmpty(),
    body('title').trim().notEmpty().withMessage('Le titre est obligatoire')
      .isLength({ max: 255 }),
    body('content').optional().trim().isLength({ max: 100_000 }).withMessage('Contenu trop long (max 100 000 caractères)'),
    body('tags').optional().isArray(),
    body('tags.*').optional().isString().isLength({ max: 50 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, content = '', tags = [], emoji = '📄', parentId } = req.body as {
        title: string; content?: string; tags?: string[]; emoji?: string; parentId?: string;
      };

      // Vérifier que l'espace existe
      const { rows: spaceRows } = await pool.query<SpaceRow>(
        'SELECT id FROM confluence_spaces WHERE key = $1',
        [req.params.key.toUpperCase()]
      );
      if (!spaceRows[0]) throw new AppError(404, 'Espace introuvable');

      const { rows } = await pool.query<PageRow>(
        `INSERT INTO confluence_pages (space_id, space_key, parent_id, title, content, author_id, tags, emoji)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *, NULL::text AS author_name`,
        [spaceRows[0].id, req.params.key.toUpperCase(), parentId ?? null, title, content, req.user!.userId, tags, emoji]
      );

      logger.info('Page Confluence créée', { pageId: rows[0].id, spaceKey: req.params.key });
      res.status(201).json(formatPage(rows[0]));
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/confluence/pages/:id ───────────────────────────────────────────────
router.get(
  '/pages/:id',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query<PageRow>(
        `SELECT p.*, u.name AS author_name
         FROM confluence_pages p
         LEFT JOIN users u ON u.id = p.author_id
         WHERE p.id = $1 AND p.deleted_at IS NULL`,
        [req.params.id]
      );
      if (!rows[0]) throw new AppError(404, 'Page introuvable');

      // Incrémenter le compteur de vues de manière asynchrone (non bloquant)
      pool.query('UPDATE confluence_pages SET views = views + 1 WHERE id = $1', [req.params.id])
        .catch((e: Error) => logger.error('Erreur incrémentation vues', { error: e.message }));

      res.json(formatPage({ ...rows[0], views: rows[0].views + 1 }));
    } catch (err) {
      return next(err);
    }
  }
);

// ── PUT /api/confluence/pages/:id ────────────────────────────────────────────────
router.put(
  '/pages/:id',
  [
    param('id').notEmpty(),
    body('title').optional().trim().notEmpty().withMessage('Le titre ne peut pas être vide').isLength({ max: 255 }),
    body('content').optional().isLength({ max: 100_000 }),
    body('tags').optional().isArray(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pageId = req.params.id;
      const { title, content, tags, emoji } = req.body as {
        title?: string; content?: string; tags?: string[]; emoji?: string;
      };

      logger.info('📝 Mise à jour de page Confluence', { pageId, hasTitle: !!title, hasContent: !!content });

      const { rows } = await pool.query<PageRow>(
        `UPDATE confluence_pages
         SET title   = COALESCE($1, title),
             content = $2,
             tags    = COALESCE($3, tags),
             emoji   = COALESCE($4, emoji),
             updated_at = NOW()
         WHERE id = $5 AND deleted_at IS NULL
         RETURNING *, NULL::text AS author_name`,
        [title ?? null, content ?? '', tags ?? null, emoji ?? null, pageId]
      );

      if (!rows[0]) {
        logger.warn('❌ Page non trouvée', { pageId });
        throw new AppError(404, 'Page introuvable');
      }

      logger.info('✅ Page mise à jour avec succès', { pageId });
      res.json(formatPage(rows[0]));
    } catch (err) {
      const error = err as Error;
      logger.error('❌ Erreur mise à jour page', { error: error.message, pageId: req.params.id });
      return next(err);
    }
  }
);

// ── DELETE /api/confluence/pages/:id ─────────────────────────────────────────────
/** Soft delete de la page. */
router.delete(
  '/pages/:id',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rowCount } = await pool.query(
        'UPDATE confluence_pages SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
        [req.params.id]
      );
      if (!rowCount) throw new AppError(404, 'Page introuvable');
      logger.info('Page supprimée (soft delete)', { pageId: req.params.id });
      res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/confluence/pages/:id/like ──────────────────────────────────────────
router.post(
  '/pages/:id/like',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query<{ likes: number }>(
        'UPDATE confluence_pages SET likes = likes + 1 WHERE id = $1 AND deleted_at IS NULL RETURNING likes',
        [req.params.id]
      );
      if (!rows[0]) throw new AppError(404, 'Page introuvable');
      res.json({ likes: rows[0].likes });
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/confluence/search?q=query ──────────────────────────────────────────
router.get(
  '/search',
  [
    query('q').optional().isString().isLength({ max: 200 }).withMessage('Requête de recherche trop longue'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawQ = String(req.query.q ?? '').trim();
      if (!rawQ) {
        return res.json([]);
      }

      const searchParam = `%${rawQ}%`;
      const { rows } = await pool.query<PageRow & { space_name: string; space_color: string; space_emoji: string }>(
        `SELECT p.*, u.name AS author_name,
                s.name AS space_name, s.color AS space_color, s.emoji AS space_emoji
         FROM confluence_pages p
         JOIN confluence_spaces s ON s.id = p.space_id
         LEFT JOIN users u ON u.id = p.author_id
         WHERE (p.title ILIKE $1 OR p.content ILIKE $1)
           AND p.deleted_at IS NULL
         ORDER BY p.updated_at DESC
         LIMIT 20`,
        [searchParam]
      );

      return res.json(rows.map((r) => ({
        ...formatPage(r),
        spaceName: r.space_name,
        spaceColor: r.space_color,
        spaceEmoji: r.space_emoji,
      })));
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
