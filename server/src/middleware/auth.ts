import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { StaffJwtPayload, PhysicianSessionPayload } from '../types';
import logger from '../utils/logger';

// Extend Express Request to include auth context
declare global {
  namespace Express {
    interface Request {
      staffUser?: StaffJwtPayload;
      physicianSession?: PhysicianSessionPayload;
    }
  }
}

/**
 * Middleware: require a valid staff JWT in Authorization header.
 */
export function requireStaffAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as StaffJwtPayload;
    req.staffUser = payload;
    next();
  } catch (err) {
    logger.warn('Invalid staff JWT', { error: (err as Error).message });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware: require admin role.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.staffUser || req.staffUser.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

/**
 * Middleware: require a valid physician session JWT.
 */
export function requirePhysicianSession(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as PhysicianSessionPayload;
    if (payload.type !== 'physician_session') {
      res.status(401).json({ error: 'Invalid session type' });
      return;
    }
    req.physicianSession = payload;
    next();
  } catch (err) {
    logger.warn('Invalid physician session JWT', { error: (err as Error).message });
    res.status(401).json({ error: 'Session expired. Please re-verify your PIN.' });
  }
}

/**
 * Generate a staff JWT.
 */
export function generateStaffToken(payload: Omit<StaffJwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.staffExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Generate a physician session JWT (short-lived).
 */
export function generatePhysicianSessionToken(
  formSubmissionId: string,
  physicianId: string,
): string {
  const payload: Omit<PhysicianSessionPayload, 'iat' | 'exp'> = {
    sub: formSubmissionId,
    physician_id: physicianId,
    type: 'physician_session',
  };
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.physicianSessionExpiresIn,
  } as jwt.SignOptions);
}
