import { Router } from 'express';
import { syncController } from '../controllers/sync.controller';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();





/**
 * @swagger
 * /api/sync/lwwSyncMetadata:
 *   get:
 *     summary: Get current cloud data for lww diff
 *     tags: [Sync]
 *     responses:
 *       200:
 *         description: Current sync sequence
 */



router.get('/lwwSyncMetadata', asyncHandler(syncController.getLWWMetadata.bind(syncController)))

/**
 * @swagger
 * /api/sync/lock/acquire:
 *   post:
 *     summary: Acquire LWW sync lock
 *     tags: [Sync]
 *     description: Acquire a lock for LWW sync operations. Lock expires after 60 seconds.
 *     responses:
 *       200:
 *         description: Lock acquisition result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 lockUuid:
 *                   type: string
 *                   description: Lock UUID (only present if success is true)
 *                 ttl:
 *                   type: integer
 *                   description: Lock TTL in seconds (only present if success is true)
 *                 message:
 *                   type: string
 */
router.post('/lock/acquire', asyncHandler(syncController.acquireLwwLock.bind(syncController)));

/**
 * @swagger
 * /api/sync/lock/release:
 *   post:
 *     summary: Release LWW sync lock
 *     tags: [Sync]
 *     description: Release a previously acquired lock using the lock UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lockUuid
 *             properties:
 *               lockUuid:
 *                 type: string
 *                 description: The lock UUID received from acquire
 *     responses:
 *       200:
 *         description: Lock release result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.post('/lock/release', asyncHandler(syncController.releaseLwwLock.bind(syncController)));

/**
 * @swagger
 * /api/sync/current:
 *   get:
 *     summary: Get current sync sequence
 *     tags: [Sync]
 *     responses:
 *       200:
 *         description: Current sync sequence
 */
router.get('/current', asyncHandler(syncController.getCurrentSequence.bind(syncController)));

/**
 * @swagger
 * /api/sync/operations:
 *   get:
 *     summary: Get operations since a specific sequence
 *     tags: [Sync]
 *     parameters:
 *       - in: query
 *         name: since
 *         schema:
 *           type: integer
 *         description: Sequence number to get operations after
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 1000
 *         description: Maximum number of operations to return
 *     responses:
 *       200:
 *         description: List of operations
 */
router.get('/operations', asyncHandler(syncController.getOperations.bind(syncController)));

/**
 * @swagger
 * /api/sync/my-operations:
 *   get:
 *     summary: Get operations for current client
 *     tags: [Sync]
 *     parameters:
 *       - in: header
 *         name: X-Client-ID
 *         required: true
 *         schema:
 *           type: string
 *         description: Client identifier
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 1000
 *         description: Maximum number of operations to return
 *     responses:
 *       200:
 *         description: List of client operations
 */
router.get('/my-operations', asyncHandler(syncController.getMyOperations.bind(syncController)));

/**
 * @swagger
 * /api/sync/status:
 *   get:
 *     summary: Get sync status
 *     tags: [Sync]
 *     parameters:
 *       - in: header
 *         name: X-Client-ID
 *         schema:
 *           type: string
 *         description: Client identifier
 *       - in: header
 *         name: X-Last-Sync-Sequence
 *         schema:
 *           type: integer
 *         description: Client's last known sync sequence
 *     responses:
 *       200:
 *         description: Sync status information
 */
router.get('/status', asyncHandler(syncController.getStatus.bind(syncController)));

export default router;
