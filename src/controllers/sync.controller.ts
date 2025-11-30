import { Request, Response } from 'express';
import {
  getCurrentSyncSequence,
  getSyncOperationsSince,
  getSyncOperationsByClient,
  createSyncLogEntry,
} from '../utils/syncLogger';
import { AppError } from '../middleware/errorHandler';
import { getClientId } from '../middleware/syncValidation';
import { getImagesWithExif } from '../db/queries';
import { redisClient } from '../config/redis';
import {v4} from 'uuid'


export class SyncController {
  /**
   * Get current sync sequence
   * GET /api/sync/current
   */
  async getCurrentSequence(req: Request, res: Response) {
    const { sequence, syncUUID } = await getCurrentSyncSequence();

    res.json({
      success: true,
      data: {
        currentSequence: sequence,
        currentSyncUUID: syncUUID,
        timestamp: new Date(),
      },
    });
  }






  async getLWWMetadata(req: Request, res: Response) {
    const syncInfo = await getImagesWithExif(true);
    res.json({
      success: true,
      data: syncInfo,
    });

  }


  /**
   * Acquire LWW sync lock
   * POST /api/sync/lock/acquire
   */
  async acquireLwwLock(req: Request, res: Response) {
    const lockKey = 'sync:lww:lock';
    const lockTTL = 60; // 60 seconds

    // Check if lock already exists
    const existingLock = await redisClient.get(lockKey);

    if (existingLock) {
      res.json({
        success: false,
        message: 'Lock already acquired by another client',
      });
      return;
    }

    // Generate new lock UUID
    const lockUuid = v4();

    // Try to acquire lock atomically (SET with NX and EX)
    const result = await redisClient.set(lockKey, lockUuid, 'EX', lockTTL, 'NX');

    if (result === 'OK') {
      res.json({
        success: true,
        lockUuid,
        ttl: lockTTL,
        message: 'Lock acquired successfully',
      });
    } else {
      // Race condition: another client acquired the lock between our check and SET
      res.json({
        success: false,
        message: 'Lock already acquired by another client',
      });
    }
  }

  /**
   * Release LWW sync lock
   * POST /api/sync/lock/release
   * Body: { lockUuid: string }
   */
  async releaseLwwLock(req: Request, res: Response) {
    const { lockUuid } = req.body;
    const lockKey = 'sync:lww:lock';

    if (!lockUuid) {
      res.json({
        success: false,
        message: 'lockUuid is required',
      });
      return;
    }

    // Get current lock value
    const currentLock = await redisClient.get(lockKey);

    if (!currentLock) {
      res.json({
        success: false,
        message: 'Lock not found',
      });
      return;
    }

    if (currentLock !== lockUuid) {
      res.json({
        success: false,
        message: 'Lock UUID does not match',
      });
      return;
    }

    // Delete the lock
    await redisClient.del(lockKey);

    // Log the lock release operation in sync_log
    const clientId = getClientId(req);

    // Create a sync log entry for lock release
    const syncEntry = await createSyncLogEntry({
      operation: 'update',
      imageId: null, // No specific image for lock release
      clientId,
      status: 'completed',
      metadata: {
        lock_operation: 'release',
        lock_uuid: lockUuid,
      },
    });

    // Set sync info in response headers
    res.setHeader('X-Current-Sequence', syncEntry.syncSequence.toString());
    res.setHeader('X-Current-Sync-UUID', syncEntry.syncUUID);

    res.json({
      success: true,
      message: 'Lock released successfully',
      syncSequence: syncEntry.syncSequence,
      syncUUID: syncEntry.syncUUID,
    });
  }





  /**
   * Get operations since a specific sequence
   * GET /api/sync/operations?since=100&limit=50
   */
  async getOperations(req: Request, res: Response) {
    const sinceSequence = req.query.since ? parseInt(req.query.since as string) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

    if (isNaN(sinceSequence)) {
      throw new AppError('Invalid "since" parameter', 400);
    }

    if (isNaN(limit) || limit < 1 || limit > 1000) {
      throw new AppError('Invalid "limit" parameter. Must be between 1 and 1000', 400);
    }

    const operations = await getSyncOperationsSince(sinceSequence, limit);
    const { sequence: currentSequence, syncUUID: currentSyncUUID } = await getCurrentSyncSequence();

    res.json({
      success: true,
      count: operations.length,
      data: operations,
      sync: {
        requestedSince: sinceSequence,
        currentSequence,
        currentSyncUUID,
        hasMore: operations.length === limit,
        nextSince: operations.length > 0 ? operations[operations.length - 1].syncSequence : sinceSequence,
        nextSyncUUID: operations.length > 0 ? operations[operations.length - 1].syncUUID : null,
      },
    });
  }

  /**
   * Get operations for current client
   * GET /api/sync/my-operations?limit=50
   */
  async getMyOperations(req: Request, res: Response) {
    const clientId = getClientId(req);

    if (!clientId) {
      throw new AppError('Client ID required. Provide X-Client-ID header', 400);
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

    if (isNaN(limit) || limit < 1 || limit > 1000) {
      throw new AppError('Invalid "limit" parameter. Must be between 1 and 1000', 400);
    }

    const operations = await getSyncOperationsByClient(clientId, limit);
    const { sequence: currentSequence, syncUUID: currentSyncUUID } = await getCurrentSyncSequence();

    res.json({
      success: true,
      count: operations.length,
      data: operations,
      sync: {
        clientId,
        currentSequence,
        currentSyncUUID,
      },
    });
  }

  /**
   * Get sync status and statistics
   * GET /api/sync/status
   */
  async getStatus(req: Request, res: Response) {
    const clientId = getClientId(req);
    const lastSyncSequenceHeader = req.header('X-Last-Sync-Sequence');
    const lastSyncSequence = lastSyncSequenceHeader ? parseInt(lastSyncSequenceHeader) : undefined;

    const syncInfo = await getCurrentSyncSequence();
    const currentSequence = syncInfo.sequence;
    const currentSyncUUID = syncInfo.syncUUID;

    let operationsBehind = 0;
    let isInSync = true;

    if (lastSyncSequence !== undefined && !isNaN(lastSyncSequence)) {
      operationsBehind = Math.max(0, currentSequence - lastSyncSequence);
      isInSync = operationsBehind === 0;
    }

    // Set sync info in response headers
    res.setHeader('X-Current-Sequence', currentSequence.toString());
    if (currentSyncUUID) {
      res.setHeader('X-Current-Sync-UUID', currentSyncUUID);
    }

    res.json({
      success: true,
      data: {
        currentSequence,
        currentSyncUUID,
        clientId: clientId || null,
        lastSyncSequence: lastSyncSequence || null,
        operationsBehind,
        isInSync,
        needsSync: !isInSync,
        timestamp: new Date(),
      },
    });
  }
}

export const syncController = new SyncController();
