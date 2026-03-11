import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { StaffUserModel } from '../models/staff-user.model';
import { verifyPassword } from '../utils/crypto';
import { generateStaffToken, requireStaffAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import logger from '../utils/logger';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** POST /api/auth/login — Staff login */
router.post('/login', validateBody(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await StaffUserModel.findByEmail(email);

    if (!user || !user.is_active) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await StaffUserModel.updateLastLogin(user.id);

    const token = generateStaffToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
    });
  } catch (err) {
    logger.error('Login error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/auth/me — Get current staff user info */
router.get('/me', requireStaffAuth, async (req: Request, res: Response) => {
  try {
    const user = await StaffUserModel.findById(req.staffUser!.sub);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
    });
  } catch (err) {
    logger.error('Get me error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
