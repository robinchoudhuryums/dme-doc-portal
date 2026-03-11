import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config';

/**
 * Generate a cryptographically secure random token for signing URLs.
 */
export function generateSigningToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a numeric PIN of configured length.
 */
export function generatePin(): string {
  const max = Math.pow(10, config.signing.pinLength);
  const pin = crypto.randomInt(0, max);
  return pin.toString().padStart(config.signing.pinLength, '0');
}

/**
 * Hash a PIN using bcrypt.
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12);
}

/**
 * Verify a PIN against its hash.
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/**
 * Hash a password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against its hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
