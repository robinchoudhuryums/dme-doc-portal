import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * HIPAA security headers middleware.
 * Adds headers to prevent caching of PHI and enforce transport security.
 */
export function hipaaHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Prevent caching of responses containing PHI
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Strict transport security (HTTPS only in production)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Referrer policy — don't leak URLs containing tokens
  res.setHeader('Referrer-Policy', 'no-referrer');

  next();
}

/**
 * Request audit logger — logs every request with minimal info (no PHI).
 */
export function requestAuditLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('user-agent')?.substring(0, 200),
    });
  });

  next();
}
