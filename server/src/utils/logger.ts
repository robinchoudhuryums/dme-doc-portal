import winston from 'winston';
import { config } from '../config';

// HIPAA: Never log PHI (patient names, DOBs, etc.)
// Only log form IDs, actions, and metadata

const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'dme-esign-portal' },
  transports: [
    new winston.transports.Console({
      format: config.env === 'production'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
    }),
  ],
});

export default logger;
