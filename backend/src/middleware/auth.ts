import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'staff';
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(u: AuthUser): string {
  return jwt.sign({ email: u.email, role: u.role }, config.JWT_SECRET, { subject: u.id, expiresIn: config.JWT_EXPIRES_IN as any, algorithm: 'HS256' });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(unauthorized());
  try {
    const p = jwt.verify(h.slice(7), config.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (!p.sub || (p.role !== 'admin' && p.role !== 'staff')) return next(unauthorized('Invalid token'));
    req.user = { id: String(p.sub), email: String(p.email), role: p.role };
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}

export const requireRole =
  (...roles: Array<'admin' | 'staff'>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden(`Requires role: ${roles.join(' or ')}`));
    next();
  };
