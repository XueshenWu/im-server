import { Request, Response } from 'express';
import {
  getCurrentSyncSequence,
  getSyncOperationsSince,
  getSyncOperationsByClient,
} from '../utils/syncLogger';
import { AppError } from '../middleware/errorHandler';
import { getClientId } from '../middleware/syncValidation';
import { getImagesWithExif } from '../db/queries';

export class SyncController {
  /**
   * Get current sync sequence
   * GET /api/sync/current
   */
  async getCurrentSequence(req: Request, res: Response) {
    const currentSequence = await getCurrentSyncSequence();

    res.json({
      success: true,
      data: {
        currentSequence,
        timestamp: new Date().toISOString(),
      },
    });
  }






  async getLWWMetadata(req: Request, res: Response) {
    const syncInfo = await getImagesWithExif();
    res.json({
      success: true,
      data: syncInfo,
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
    const currentSequence = await getCurrentSyncSequence();

    res.json({
      success: true,
      count: operations.length,
      data: operations,
      sync: {
        requestedSince: sinceSequence,
        currentSequence,
        hasMore: operations.length === limit,
        nextSince: operations.length > 0 ? operations[operations.length - 1].syncSequence : sinceSequence,
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
    const currentSequence = await getCurrentSyncSequence();

    res.json({
      success: true,
      count: operations.length,
      data: operations,
      sync: {
        clientId,
        currentSequence,
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

    const currentSequence = await getCurrentSyncSequence();

    let operationsBehind = 0;
    let isInSync = true;

    if (lastSyncSequence !== undefined && !isNaN(lastSyncSequence)) {
      operationsBehind = Math.max(0, currentSequence - lastSyncSequence);
      isInSync = operationsBehind === 0;
    }

    res.json({
      success: true,
      data: {
        currentSequence,
        clientId: clientId || null,
        lastSyncSequence: lastSyncSequence || null,
        operationsBehind,
        isInSync,
        needsSync: !isInSync,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

export const syncController = new SyncController();
