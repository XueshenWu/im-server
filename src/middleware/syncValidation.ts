import { Request, Response, NextFunction } from 'express';
import { getCurrentSyncSequence } from '../utils/syncLogger';
import { AppError } from './errorHandler';
import logger from '../config/logger';
import { redisClient } from '../config/redis';

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

    // Determine if client is in sync
    const isInSync = lastSyncSequence === currentSequence;
    const operationsBehind = Math.max(0, currentSequence - lastSyncSequence);

    // Log sync state for monitoring (but don't block operations)
    if (!isInSync) {
      logger.info(
        `Client behind: Client at sequence ${lastSyncSequence}, server at ${currentSequence} (${operationsBehind} operations behind)`
      );
    }

    // Set sync status in request for controllers to use
    syncReq.sync.isInSync = isInSync;

    // Set pre-operation sequence info in headers (for monitoring)
    if (!isInSync) {
      res.setHeader('X-Client-Sequence', lastSyncSequence.toString());
      res.setHeader('X-Operations-Behind', operationsBehind.toString());
    }

    // Client sequence ahead of server is suspicious but don't block
    // (could happen during development, server resets, etc.)
    if (lastSyncSequence > currentSequence) {
      logger.warn(
        `Client sequence ahead: Client at ${lastSyncSequence}, server at ${currentSequence}. Client may need to reset sync state.`
      );
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override res.json to update sequence before sending
    (res as any).json = async function(body: any) {
      // Always get the latest sequence before sending response
      // This ensures client gets the most up-to-date sequence for:
      // - Write operations: sequence AFTER the operation is logged
      // - Read operations: current server sequence (for cloud mode sync)
      try {
        const finalSequence = await getCurrentSyncSequence();
        res.setHeader('X-Current-Sequence', finalSequence.toString());
      } catch (err) {
        logger.error('Failed to get final sequence:', err);
        // Fallback to sequence from before operation if query fails
        res.setHeader('X-Current-Sequence', currentSequence.toString());
      }

      return originalJson(body);
    };

    // Allow the operation to proceed
    return next();
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

/**
 * Middleware to validate LWW lock for protected operations
 * Checks if a lock exists and validates the provided UUID
 *
 * Use this middleware for routes that modify metadata or generate presigned PUT URLs
 */
export const validateLwwLock = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const lockKey = 'sync:lww:lock';

    // For read operations, no lock validation needed
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    // Check if a lock exists
    const existingLock = await redisClient.get(lockKey);

    // No lock exists, allow operation
    if (!existingLock) {
      return next();
    }

    // Lock exists, validate the UUID from header
    const providedLockUuid = req.header('X-Lock-UUID');

    if (!providedLockUuid) {
      throw new AppError(
        'Lock is active. Please provide X-Lock-UUID header with your lock ID',
        423 // 423 Locked status code
      );
    }

    if (providedLockUuid !== existingLock) {
      throw new AppError(
        'Invalid lock UUID. The provided UUID does not match the active lock',
        423
      );
    }

    // Lock UUID is valid, allow operation
    return next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    logger.error('Lock validation error:', error);
    return next(new AppError('Lock validation failed', 500));
  }
};
