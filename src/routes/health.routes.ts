import { Router } from 'express';
import { db } from '../db/index';
import { sql } from 'drizzle-orm';
import { redisClient } from '../config/redis';
import minioClient from '../config/minio';

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: All services are healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthStatus'
 *       503:
 *         description: One or more services are unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthStatus'
 */
router.get('/', async (req, res) => {
  const timestamp = new Date().toISOString();
  const services: any = {
    postgresql: { status: 'unknown', responseTime: 0 },
    redis: { status: 'unknown', responseTime: 0 },
    minio: { status: 'unknown', responseTime: 0 },
  };

  let allHealthy = true;

  // Test PostgreSQL connection
  try {
    const startPg = Date.now();
    await db.execute(sql`SELECT 1`);
    services.postgresql = {
      status: 'connected',
      responseTime: Date.now() - startPg,
    };
  } catch (error) {
    allHealthy = false;
    services.postgresql = {
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: 0,
    };
  }

  // Test Redis connection
  try {
    const startRedis = Date.now();
    await redisClient.ping();
    services.redis = {
      status: 'connected',
      responseTime: Date.now() - startRedis,
    };
  } catch (error) {
    allHealthy = false;
    services.redis = {
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: 0,
    };
  }

  // Test MinIO connection
  try {
    const startMinio = Date.now();
    // List buckets as a simple health check
    await minioClient.listBuckets();
    services.minio = {
      status: 'connected',
      responseTime: Date.now() - startMinio,
    };
  } catch (error) {
    allHealthy = false;
    services.minio = {
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: 0,
    };
  }

  const statusCode = allHealthy ? 200 : 503;
  const status = allHealthy ? 'ok' : 'degraded';

  res.status(statusCode).json({
    status,
    timestamp,
    services,
  });
});

export default router;
