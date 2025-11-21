import { randomUUID } from 'crypto';
import { createSyncLog, createSyncLogs, updateSyncLogStatus, updateSyncLogStatusByActionGroupId } from '../db/queries';
import type { NewSyncLog } from '../db/schema';

export type OperationType = 'upload' | 'download' | 'update' | 'delete' | 'conflict';
export type StatusType = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Log a single image operation
 */
export async function logSingleOperation(
  operation: OperationType,
  imageId: number | null,
  metadata?: Record<string, any>
) {
  return await createSyncLog({
    operation,
    imageId,
    status: 'completed',
    metadata: metadata || null,
    completedAt: new Date(),
  });
}

/**
 * Create a log entry for a single operation that may take time
 * Returns the log ID so it can be updated later
 */
export async function startSingleOperation(
  operation: OperationType,
  imageId: number | null,
  metadata?: Record<string, any>
) {
  const log = await createSyncLog({
    operation,
    imageId,
    status: 'pending',
    metadata: metadata || null,
  });
  return log.id;
}

/**
 * Update an existing log entry
 */
export async function updateOperationStatus(
  logId: number,
  status: StatusType,
  errorMessage?: string
) {
  return await updateSyncLogStatus(logId, status, errorMessage);
}

/**
 * Log a batch operation (e.g., batch upload, batch delete)
 * Creates a batch record and individual records for each image with the same action_group_id
 */
export async function logBatchOperation(
  operation: OperationType,
  imageIds: (number | null)[],
  metadata?: Record<string, any>
): Promise<{ actionGroupId: string; logs: any[] }> {
  const actionGroupId = randomUUID();

  // Create individual log entries for each image with the same action_group_id
  const logEntries: NewSyncLog[] = imageIds.map(imageId => ({
    operation,
    imageId,
    actionGroupId,
    status: 'completed' as const,
    metadata: metadata || null,
    completedAt: new Date(),
  }));

  const logs = await createSyncLogs(logEntries);

  return { actionGroupId, logs };
}

/**
 * Start a batch operation (returns action_group_id for later updates)
 * Creates pending log entries for each image
 */
export async function startBatchOperation(
  operation: OperationType,
  imageIds: (number | null)[],
  metadata?: Record<string, any>
): Promise<{ actionGroupId: string; logs: any[] }> {
  const actionGroupId = randomUUID();

  // Create individual log entries for each image with the same action_group_id
  const logEntries: NewSyncLog[] = imageIds.map(imageId => ({
    operation,
    imageId,
    actionGroupId,
    status: 'pending' as const,
    metadata: metadata || null,
  }));

  const logs = await createSyncLogs(logEntries);

  return { actionGroupId, logs };
}

/**
 * Update all log entries in a batch operation by action_group_id
 */
export async function updateBatchOperationStatus(
  actionGroupId: string,
  status: StatusType,
  errorMessage?: string
) {
  return await updateSyncLogStatusByActionGroupId(actionGroupId, status, errorMessage);
}

/**
 * Helper to wrap an operation with automatic logging
 * For single operations
 */
export async function withSingleOperationLogging<T>(
  operation: OperationType,
  imageId: number | null,
  operationFn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const logId = await startSingleOperation(operation, imageId, metadata);

  try {
    await updateOperationStatus(logId, 'in_progress');
    const result = await operationFn();
    await updateOperationStatus(logId, 'completed');
    return result;
  } catch (error) {
    await updateOperationStatus(logId, 'failed', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Helper to wrap a batch operation with automatic logging
 */
export async function withBatchOperationLogging<T>(
  operation: OperationType,
  imageIds: (number | null)[],
  operationFn: (actionGroupId: string) => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const { actionGroupId } = await startBatchOperation(operation, imageIds, metadata);

  try {
    await updateBatchOperationStatus(actionGroupId, 'in_progress');
    const result = await operationFn(actionGroupId);
    await updateBatchOperationStatus(actionGroupId, 'completed');
    return result;
  } catch (error) {
    await updateBatchOperationStatus(actionGroupId, 'failed', error instanceof Error ? error.message : String(error));
    throw error;
  }
}
