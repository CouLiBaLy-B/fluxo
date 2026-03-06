import { Router } from 'express';
import authRouter       from './auth';
import usersRouter      from './users';
import projectsRouter   from './projects';
import issuesRouter     from './issues';
import sprintsRouter    from './sprints';
import confluenceRouter from './confluence';

const router = Router();

// ── Authentification (pas de middleware auth global ici) ──────────────────────
router.use('/auth',       authRouter);

// ── Ressources protégées ───────────────────────────────────────────────────────
router.use('/users',      usersRouter);
router.use('/projects',   projectsRouter);
router.use('/issues',     issuesRouter);
router.use('/sprints',    sprintsRouter);
router.use('/confluence', confluenceRouter);

export default router;
