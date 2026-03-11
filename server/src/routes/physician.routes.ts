import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PhysicianModel } from '../models/physician.model';
import { requireStaffAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import logger from '../utils/logger';

const router = Router();

const physicianFieldsSchema = {
  npi: z.string().length(10),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  fax_number: z.string().max(20).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  practice_name: z.string().max(255).optional(),
  address_line1: z.string().max(255).optional(),
  address_line2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  zip: z.string().max(10).optional(),
};

const createPhysicianSchema = z.object(physicianFieldsSchema);

// For PATCH, all fields are optional (partial update)
const updatePhysicianSchema = z.object(physicianFieldsSchema).partial();

/** GET /api/physicians — List / search physicians */
router.get('/', requireStaffAuth, async (req: Request, res: Response) => {
  try {
    const { q, page } = req.query;
    if (q && typeof q === 'string') {
      const results = await PhysicianModel.search(q);
      res.json({ data: results });
      return;
    }
    const result = await PhysicianModel.list(Number(page) || 1);
    res.json(result);
  } catch (err) {
    logger.error('List physicians error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/physicians/:id */
router.get('/:id', requireStaffAuth, async (req: Request, res: Response) => {
  try {
    const physician = await PhysicianModel.findById(req.params.id);
    if (!physician) {
      res.status(404).json({ error: 'Physician not found' });
      return;
    }
    res.json(physician);
  } catch (err) {
    logger.error('Get physician error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/physicians — Create physician */
router.post('/', requireStaffAuth, validateBody(createPhysicianSchema), async (req: Request, res: Response) => {
  try {
    const existing = await PhysicianModel.findByNpi(req.body.npi);
    if (existing) {
      res.status(409).json({ error: 'Physician with this NPI already exists' });
      return;
    }
    const physician = await PhysicianModel.create(req.body);
    res.status(201).json(physician);
  } catch (err) {
    logger.error('Create physician error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PATCH /api/physicians/:id — Update physician */
router.patch('/:id', requireStaffAuth, validateBody(updatePhysicianSchema), async (req: Request, res: Response) => {
  try {
    const physician = await PhysicianModel.update(req.params.id, req.body);
    if (!physician) {
      res.status(404).json({ error: 'Physician not found' });
      return;
    }
    res.json(physician);
  } catch (err) {
    logger.error('Update physician error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
