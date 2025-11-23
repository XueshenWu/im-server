-- Migration: Add sync tracking columns to sync_log table
-- Date: 2025-11-23
-- Description: Add sync_sequence, client_id, and group_operation_id for sync tracking

-- Add new columns
ALTER TABLE sync_log
  ADD COLUMN sync_sequence BIGSERIAL UNIQUE NOT NULL,
  ADD COLUMN client_id VARCHAR(100),
  ADD COLUMN group_operation_id INTEGER REFERENCES sync_log(id) ON DELETE CASCADE;

-- Update operation types to include batch operations
ALTER TABLE sync_log
  DROP CONSTRAINT IF EXISTS sync_log_operation_check;

ALTER TABLE sync_log
  ADD CONSTRAINT sync_log_operation_check
  CHECK (operation IN (
    'upload',
    'download',
    'update',
    'delete',
    'conflict',
    'batch_upload',
    'batch_delete',
    'batch_update',
    'replace'
  ));

-- Create index on sync_sequence for fast lookups
CREATE INDEX idx_sync_log_sync_sequence ON sync_log(sync_sequence DESC);

-- Create index on client_id for filtering by client
CREATE INDEX idx_sync_log_client_id ON sync_log(client_id);

-- Create index on group_operation_id for batch operations
CREATE INDEX idx_sync_log_group_operation_id ON sync_log(group_operation_id) WHERE group_operation_id IS NOT NULL;

-- Update comments
COMMENT ON COLUMN sync_log.sync_sequence IS 'Global sequence number for ordering all operations (like Git commits)';
COMMENT ON COLUMN sync_log.client_id IS 'Identifier of the client/device that performed the operation';
COMMENT ON COLUMN sync_log.group_operation_id IS 'References parent sync_log.id for batch operations';
