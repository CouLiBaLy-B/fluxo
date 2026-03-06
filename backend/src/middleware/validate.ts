import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

/**
 * Middleware à monter après les règles express-validator.
 * Retourne 400 avec la liste des erreurs si la validation échoue.
 *
 * @example
 * router.post('/',
 *   body('title').notEmpty().withMessage('Le titre est obligatoire'),
 *   validate,
 *   handler
 * )
 */
export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Les données envoyées sont invalides',
      details: errors.array().map((e) => ({
        field: e.type === 'field' ? e.path : 'unknown',
        message: e.msg,
      })),
    });
    return;
  }

  next();
}
