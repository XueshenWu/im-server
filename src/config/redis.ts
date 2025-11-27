import Redis from 'ioredis';
import logger from './logger';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6370');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0');

/**
 * Redis client for chunked upload session management
 */
export const redisClient = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  db: REDIS_DB,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

redisClient.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redisClient.on('ready', () => {
  logger.info('Redis ready');
});

