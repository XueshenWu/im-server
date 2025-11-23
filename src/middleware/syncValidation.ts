import { Request, Response, NextFunction } from 'express';
import { getCurrentSyncSequence } from '../utils/syncLogger';
import { AppError } from './errorHandler';
import logger from '../config/logger';

/**
 * Extended Request type with sync information
 */
export interface SyncRequest extends Request {
  sync?: {
    clientId?: string;
    lastSyncSequence?: number;
    currentSequence: number;
    isInSync: boolean;
  };
}

/**
 * Middleware to extract and validate sync headers
 * Checks if client is in sync with server before allowing write operations
 */
export const validateSync = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const syncReq = req as SyncRequest;

    // Extract sync information from headers
    const clientId = req.header('X-Client-ID');
    const lastSyncSequenceHeader = req.header('X-Last-Sync-Sequence');
    const lastSyncSequence = lastSyncSequenceHeader ? parseInt(lastSyncSequenceHeader) : undefined;

    // Get current server sequence
    const currentSequence = await getCurrentSyncSequence();

    // Attach sync info to request for use in controllers
    syncReq.sync = {
      clientId,
      lastSyncSequence,
      currentSequence,
      isInSync: false,
    };

    // For GET requests (read-only), no sync validation needed
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      syncReq.sync.isInSync = true;
      // Always return current sequence in response headers
      res.setHeader('X-Current-Sequence', currentSequence.toString());
      return next();
    }

    // For write operations, check if client sync header is present
    if (lastSyncSequence === undefined) {
      // Client didn't provide sync information - allow it for now but warn
      logger.warn(
        `Write operation without sync info: ${req.method} ${req.path} from ${req.ip}`
      );
      syncReq.sync.isInSync = true;
      res.setHeader('X-Current-Sequence', currentSequence.toString());
      return next();
    }

    // Validate sync sequence
    if (isNaN(lastSyncSequence)) {
      throw new AppError('Invalid sync sequence number', 400);
    }

    // Check if client is in sync (fast-forward scenario)
    if (lastSyncSequence === currentSequence) {
      // Client is up to date
      syncReq.sync.isInSync = true;
      res.setHeader('X-Current-Sequence', currentSequence.toString());
      return next();
    }

    // Client is behind (conflict scenario)
    if (lastSyncSequence < currentSequence) {
      const operationsBehind = currentSequence - lastSyncSequence;

      logger.warn(
        `Sync conflict: Client at sequence ${lastSyncSequence}, server at ${currentSequence} (${operationsBehind} operations behind)`
      );

      res.setHeader('X-Current-Sequence', currentSequence.toString());
      res.setHeader('X-Client-Sequence', lastSyncSequence.toString());
      res.setHeader('X-Operations-Behind', operationsBehind.toString());

      throw new AppError(
        `Sync conflict: You are ${operationsBehind} operation(s) behind. Please sync first (GET /api/sync/operations?since=${lastSyncSequence})`,
        409 // Conflict status code
      );
    }

    // Client sequence is ahead of server (should never happen unless client is lying or server lost data)
    if (lastSyncSequence > currentSequence) {
      logger.error(
        `Invalid state: Client sequence (${lastSyncSequence}) > Server sequence (${currentSequence})`
      );

      throw new AppError(
        'Invalid sync state: Client sequence is ahead of server. Please reset your sync.',
        409
      );
    }

    // This should never be reached
    throw new AppError('Unexpected sync validation state', 500);
  } catch (error) {
    // If error is already AppError, pass it through
    if (error instanceof AppError) {
      return next(error);
    }

    // Log unexpected errors
    logger.error('Sync validation error:', error);
    return next(new AppError('Sync validation failed', 500));
  }
};

/**
 * Middleware to require sync validation for specific routes
 * Use this for critical operations that must enforce sync
 */
export const requireSync = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const syncReq = req as SyncRequest;

  // If sync info wasn't populated, run validation first
  if (!syncReq.sync) {
    return validateSync(req, res, next);
  }

  // For read operations, always allow
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  // For write operations, require sync headers
  if (syncReq.sync.lastSyncSequence === undefined) {
    throw new AppError(
      'Sync required: Please provide X-Last-Sync-Sequence header for this operation',
      400
    );
  }

  // Check if in sync
  if (!syncReq.sync.isInSync) {
    const operationsBehind = syncReq.sync.currentSequence - (syncReq.sync.lastSyncSequence || 0);

    throw new AppError(
      `Sync required: You are ${operationsBehind} operation(s) behind. Please sync first (GET /api/sync/operations?since=${syncReq.sync.lastSyncSequence})`,
      409
    );
  }

  next();
};

/**
 * Helper to extract client ID from request
 */
export function getClientId(req: Request): string | undefined {
  const syncReq = req as SyncRequest;
  return syncReq.sync?.clientId || req.header('X-Client-ID');
}
