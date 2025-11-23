import { db } from '../db';
import { syncLog } from '../db/schema';
import { eq, desc, gt, and } from 'drizzle-orm';
import logger from '../config/logger';

/**
 * Operation types for sync logging
 */
export type SyncOperation =
  | 'upload'
  | 'download'
  | 'update'
  | 'delete'
  | 'replace'
  | 'conflict'
  | 'batch_upload'
  | 'batch_delete'
  | 'batch_update';

/**
 * Status types for sync operations
 */
export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Metadata for sync log entries
 */
export interface SyncLogMetadata {
  // Common fields
  request_source?: string;
  client_id?: string;
  user_agent?: string;
  ip_address?: string;

  // File/image specific
  original_filename?: string;
  file_size?: number;
  file_hash?: string;

  // Batch operation specific
  total_count?: number;
  success_count?: number;
  failed_count?: number;
  group_operation_id?: number;

  // Error specific
  error_code?: string;
  error_details?: string;
  attempted_at?: string;

  // Any additional data
  [key: string]: any;
}

/**
 * Get the current maximum sync sequence number
 */
export async function getCurrentSyncSequence(): Promise<number> {
  const result = await db
    .select({ syncSequence: syncLog.syncSequence })
    .from(syncLog)
    .orderBy(desc(syncLog.syncSequence))
    .limit(1);

  return result[0]?.syncSequence || 0;
}

/**
 * Create a sync log entry
 */
export async function createSyncLogEntry(params: {
  operation: SyncOperation;
  imageId?: number | null;
  clientId?: string;
  groupOperationId?: number | null;
  status?: SyncStatus;
  metadata?: SyncLogMetadata;
}): Promise<{ id: number; syncSequence: number }> {
  const {
    operation,
    imageId = null,
    clientId,
    groupOperationId = null,
    status = 'pending',
    metadata = {},
  } = params;

  try {
    const result = await db
      .insert(syncLog)
      .values({
        operation,
        imageId,
        clientId,
        groupOperationId,
        status,
        metadata: metadata as any,
        createdAt: new Date(),
      })
      .returning({ id: syncLog.id, syncSequence: syncLog.syncSequence });

    logger.info(
      `Sync log created: seq=${result[0].syncSequence}, operation=${operation}, imageId=${imageId}, clientId=${clientId}`
    );

    return result[0];
  } catch (error) {
    logger.error('Failed to create sync log entry:', error);
    throw error;
  }
}

/**
 * Update sync log status
 */
export async function updateSyncLogStatus(
  id: number,
  status: SyncStatus,
  errorMessage?: string
): Promise<void> {
  try {
    await db
      .update(syncLog)
      .set({
        status,
        errorMessage,
        completedAt: status === 'completed' || status === 'failed' ? new Date() : undefined,
      })
      .where(eq(syncLog.id, id));

    logger.info(`Sync log ${id} updated to status: ${status}`);
  } catch (error) {
    logger.error(`Failed to update sync log ${id}:`, error);
    throw error;
  }
}

/**
 * Get sync operations since a specific sequence number
 */
export async function getSyncOperationsSince(
  sinceSequence: number,
  limit: number = 100
): Promise<any[]> {
  return await db
    .select()
    .from(syncLog)
    .where(gt(syncLog.syncSequence, sinceSequence))
    .orderBy(syncLog.syncSequence)
    .limit(limit);
}

/**
 * Get sync operations for a specific client
 */
export async function getSyncOperationsByClient(
  clientId: string,
  limit: number = 100
): Promise<any[]> {
  return await db
    .select()
    .from(syncLog)
    .where(eq(syncLog.clientId, clientId))
    .orderBy(desc(syncLog.syncSequence))
    .limit(limit);
}

/**
 * Create a batch operation parent record
 * Returns the parent operation ID that should be used for child operations
 */
export async function createBatchOperation(params: {
  operation: 'batch_upload' | 'batch_delete' | 'batch_update';
  clientId?: string;
  totalCount: number;
  metadata?: SyncLogMetadata;
}): Promise<{ id: number; syncSequence: number }> {
  const { operation, clientId, totalCount, metadata = {} } = params;

  const batchMetadata: SyncLogMetadata = {
    ...metadata,
    total_count: totalCount,
    success_count: 0,
    failed_count: 0,
  };

  return await createSyncLogEntry({
    operation,
    imageId: null, // Batch parent has no specific image
    clientId,
    status: 'in_progress',
    metadata: batchMetadata,
  });
}

/**
 * Update batch operation summary
 */
export async function updateBatchOperationSummary(
  batchId: number,
  successCount: number,
  failedCount: number
): Promise<void> {
  try {
    // Get current metadata
    const current = await db
      .select()
      .from(syncLog)
      .where(eq(syncLog.id, batchId))
      .limit(1);

    if (!current[0]) {
      throw new Error(`Batch operation ${batchId} not found`);
    }

    const metadata = (current[0].metadata as SyncLogMetadata) || {};
    metadata.success_count = successCount;
    metadata.failed_count = failedCount;

    const status: SyncStatus = failedCount === 0 ? 'completed' : 'completed';

    await db
      .update(syncLog)
      .set({
        metadata: metadata as any,
        status,
        completedAt: new Date(),
      })
      .where(eq(syncLog.id, batchId));

    logger.info(
      `Batch operation ${batchId} completed: ${successCount} success, ${failedCount} failed`
    );
  } catch (error) {
    logger.error(`Failed to update batch operation ${batchId}:`, error);
    throw error;
  }
}

/**
 * Log a successful operation
 */
export async function logSuccessfulOperation(params: {
  operation: SyncOperation;
  imageId: number;
  clientId?: string;
  groupOperationId?: number;
  metadata?: SyncLogMetadata;
}): Promise<{ id: number; syncSequence: number }> {
  return await createSyncLogEntry({
    ...params,
    status: 'completed',
  });
}

/**
 * Log a failed operation
 */
export async function logFailedOperation(params: {
  operation: SyncOperation;
  imageId?: number;
  clientId?: string;
  groupOperationId?: number;
  errorMessage: string;
  metadata?: SyncLogMetadata;
}): Promise<{ id: number; syncSequence: number }> {
  const { errorMessage, ...rest } = params;

  return await createSyncLogEntry({
    ...rest,
    status: 'failed',
    metadata: {
      ...rest.metadata,
      error_details: errorMessage,
    },
  });
}
