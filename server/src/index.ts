import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { testConnection } from './config/database';
import { hipaaHeaders, requestAuditLogger } from './middleware/hipaa';
import logger from './utils/logger';

// Routes
import authRoutes from './routes/auth.routes';
import physicianRoutes from './routes/physician.routes';
import patientRoutes from './routes/patient.routes';
import formRoutes from './routes/form.routes';
import signingRoutes from './routes/signing.routes';

const app = express();

// ─── Global Middleware ───────────────────────────────────────────────────────

// Security headers
app.use(helmet());
app.use(hipaaHeaders);

// CORS
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestAuditLogger);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Stricter rate limit on PIN verification to prevent brute-force
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again later.' },
});
app.use('/api/sign/:token/verify', pinLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/physicians', physicianRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/sign', signingRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

async function start() {
  try {
    await testConnection();
    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} (${config.env})`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

start();

export default app;
