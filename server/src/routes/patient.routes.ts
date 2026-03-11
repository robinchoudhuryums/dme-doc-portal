import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PatientModel } from '../models/patient.model';
import { requireStaffAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import logger from '../utils/logger';

const router = Router();

const createPatientSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  medicare_id: z.string().max(20).optional(),
  insurance_id: z.string().max(50).optional(),
  address_line1: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  zip: z.string().max(10).optional(),
});

/** GET /api/patients?q=search */
router.get('/', requireStaffAuth, async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (q && typeof q === 'string') {
      const results = await PatientModel.search(q);
      res.json({ data: results });
      return;
    }
    res.status(400).json({ error: 'Search query required' });
  } catch (err) {
    logger.error('Search patients error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/patients */
router.post('/', requireStaffAuth, validateBody(createPatientSchema), async (req: Request, res: Response) => {
  try {
    const patient = await PatientModel.create(req.body);
    res.status(201).json(patient);
  } catch (err) {
    logger.error('Create patient error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
