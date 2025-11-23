-- Fix sync_sequence to use auto-incrementing sequence
-- This migration adds the missing DEFAULT value for sync_sequence column

-- Create the sequence if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS sync_log_sync_sequence_seq;

-- Set the sequence as the default value for sync_sequence column
ALTER TABLE sync_log
ALTER COLUMN sync_sequence SET DEFAULT nextval('sync_log_sync_sequence_seq'::regclass);

-- Set the sequence's current value to max(sync_sequence) + 1
-- This ensures new inserts get the next available sequence number
SELECT setval(
    'sync_log_sync_sequence_seq',
    COALESCE((SELECT MAX(sync_sequence) FROM sync_log), 0) + 1,
    false
);

-- Verify the change
\d sync_log;
