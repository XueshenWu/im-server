import Redis from 'ioredis';
import logger from './logger';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0');

/**
 * Redis client for chunked upload session management
 */
export const redis = new Redis({
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

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redis.on('ready', () => {
  logger.info('Redis ready');
});

/**
 * Upload session key prefix
 */
export const SESSION_PREFIX = 'upload:session:';

/**
 * Session TTL (24 hours in seconds)
 */
export const SESSION_TTL = 24 * 60 * 60;

/**
 * Helper to get session key
 */
export function getSessionKey(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}`;
}

/**
 * Upload session data structure stored in Redis
 */
export interface UploadSessionData {
  sessionId: string;
  originalName: string;
  filename: string;
  totalChunks: number;
  totalSize: number;
  chunkSize: number;
  mimeType: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  uploadedChunks: number[]; // Array of uploaded chunk indices
  createdAt: string; // ISO timestamp
}
