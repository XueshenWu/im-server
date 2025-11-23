# Sync System Documentation

## Overview

The image management server includes a **Git-like synchronization system** that tracks all image operations (upload, delete, update, replace) with a global sequence counter. This enables clients to stay in sync with the server and detect conflicts before they occur.

## Core Concept: The Clock Mechanism

The sync system works like a **global clock** that ticks forward with every operation:

```
Sequence | Operation    | Image     | Client      | What Happened
---------|--------------|-----------|-------------|------------------
1        | upload       | img_001   | Desktop     | Uploaded photo.jpg
2        | upload       | img_002   | Mobile      | Uploaded cat.jpg
3        | delete       | img_002   | Desktop     | Deleted cat.jpg
4        | batch_upload | NULL      | Desktop     | Batch started (parent)
5        | upload       | img_003   | Desktop     | ↳ sunset.jpg
6        | upload       | img_004   | Desktop     | ↳ beach.jpg
7        | update       | img_001   | Mobile      | Renamed photo.jpg
```

## Database Schema

### sync_log Table

```sql
CREATE TABLE sync_log (
    id SERIAL PRIMARY KEY,
    sync_sequence BIGSERIAL UNIQUE NOT NULL,  -- Global counter (like Git commits)
    operation VARCHAR(20) NOT NULL,            -- Operation type
    image_id INTEGER REFERENCES images(id),    -- Which image (NULL for batch parents)
    client_id VARCHAR(100),                    -- Which client performed it
    group_operation_id INTEGER,                -- Links batch items to parent
    status VARCHAR(20) NOT NULL,               -- pending, in_progress, completed, failed
    error_message TEXT,                        -- For failed operations
    metadata JSONB,                            -- Flexible metadata storage
    created_at TIMESTAMP,
    completed_at TIMESTAMP
);
```

### Operation Types

| Type | Description | image_id | Example |
|------|-------------|----------|---------|
| `upload` | Single file upload | Image ID | Regular upload or part of batch |
| `delete` | Image deletion | Image ID | Single or batch delete |
| `update` | Metadata update | Image ID | Rename, tag change |
| `replace` | File replacement | Image ID | Replace image content |
| `batch_upload` | Batch parent | NULL | Groups multiple uploads |
| `batch_delete` | Batch parent | NULL | Groups multiple deletes |
| `batch_update` | Batch parent | NULL | Groups multiple updates |
| `conflict` | Sync conflict | Image ID | When operations conflict |

### Metadata Structure

**Batch Parent:**
```json
{
  "total_count": 10,
  "success_count": 8,
  "failed_count": 2,
  "request_source": "api",
  "user_agent": "ImageClient/1.0"
}
```

**Individual Operation:**
```json
{
  "group_operation_id": 123,
  "original_filename": "photo.jpg",
  "file_size": 2048576,
  "file_hash": "sha256...",
  "upload_type": "chunked",
  "chunks_count": 10
}
```

## API Endpoints

### GET /api/sync/current

Get the current sync sequence number.

**Response:**
```json
{
  "success": true,
  "data": {
    "currentSequence": 150,
    "timestamp": "2025-11-23T10:30:00Z"
  }
}
```

### GET /api/sync/operations?since=100&limit=50

Get operations since a specific sequence.

**Query Parameters:**
- `since` (required): Sequence number to get operations after
- `limit` (optional, default=100): Max operations to return (max 1000)

**Response:**
```json
{
  "success": true,
  "count": 25,
  "data": [
    {
      "id": 101,
      "syncSequence": 101,
      "operation": "upload",
      "imageId": 5,
      "clientId": "desktop-app-123",
      "status": "completed",
      "metadata": { "original_filename": "photo.jpg" },
      "createdAt": "2025-11-23T10:15:00Z"
    }
  ],
  "sync": {
    "requestedSince": 100,
    "currentSequence": 150,
    "hasMore": true,
    "nextSince": 125
  }
}
```

### GET /api/sync/my-operations?limit=50

Get operations performed by the current client.

**Headers Required:**
- `X-Client-ID`: Your client identifier

**Response:**
```json
{
  "success": true,
  "count": 10,
  "data": [...],
  "sync": {
    "clientId": "desktop-app-123",
    "currentSequence": 150
  }
}
```

### GET /api/sync/status

Check if client is in sync with server.

**Headers:**
- `X-Client-ID` (optional): Your client identifier
- `X-Last-Sync-Sequence` (optional): Your last known sequence

**Response:**
```json
{
  "success": true,
  "data": {
    "currentSequence": 150,
    "clientId": "desktop-app-123",
    "lastSyncSequence": 145,
    "operationsBehind": 5,
    "isInSync": false,
    "needsSync": true,
    "timestamp": "2025-11-23T10:30:00Z"
  }
}
```

## Client Integration

### 1. Initial Setup

```javascript
class SyncClient {
  constructor(baseUrl, clientId) {
    this.baseUrl = baseUrl;
    this.clientId = clientId;
    this.lastSyncSequence = 0; // Load from local storage
  }

  // Set headers for all requests
  getHeaders() {
    return {
      'X-Client-ID': this.clientId,
      'X-Last-Sync-Sequence': this.lastSyncSequence.toString()
    };
  }
}
```

### 2. Sync Operations

```javascript
async sync() {
  // Get operations since last sync
  const response = await fetch(
    `${this.baseUrl}/api/sync/operations?since=${this.lastSyncSequence}`,
    { headers: this.getHeaders() }
  );

  const { data, sync } = await response.json();

  // Apply operations locally
  for (const operation of data) {
    await this.applyOperation(operation);
  }

  // Update last sync sequence
  this.lastSyncSequence = sync.currentSequence;
  this.saveToLocalStorage();
}

async applyOperation(operation) {
  switch (operation.operation) {
    case 'upload':
      await this.localDb.addImage(operation.imageId, operation.metadata);
      break;
    case 'delete':
      await this.localDb.deleteImage(operation.imageId);
      break;
    case 'update':
      await this.localDb.updateImage(operation.imageId, operation.metadata);
      break;
  }
}
```

### 3. Upload with Sync Check

```javascript
async uploadImage(file) {
  try {
    const formData = new FormData();
    formData.append('images', file);

    const response = await fetch(`${this.baseUrl}/api/images/upload`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: formData
    });

    if (response.status === 409) {
      // Conflict! Need to sync first
      const conflict = await response.json();
      console.log('Out of sync:', conflict.message);

      // Sync and retry
      await this.sync();
      return await this.uploadImage(file);
    }

    // Success - update sequence from response headers
    this.lastSyncSequence = parseInt(response.headers.get('X-Current-Sequence'));
    return await response.json();

  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}
```

### 4. Handling Conflicts

When a **409 Conflict** response is received:

```javascript
async handleConflict(response) {
  const operationsBehind = parseInt(response.headers.get('X-Operations-Behind'));
  const currentSequence = parseInt(response.headers.get('X-Current-Sequence'));

  console.log(`You are ${operationsBehind} operations behind`);
  console.log(`Server is at sequence ${currentSequence}`);

  // Sync to catch up
  await this.sync();

  // Retry the operation
  return true; // Indicate caller should retry
}
```

## Sync Flow Example

```
1. Desktop Client starts (last_sync_sequence = 0)
   → GET /api/sync/operations?since=0
   → Receives operations 1-100
   → last_sync_sequence = 100

2. Desktop uploads image
   → POST /api/images/upload
   → Headers: X-Last-Sync-Sequence: 100
   → Server: seq=100, current=100 → ACCEPT ✓
   → New sequence: 101
   → Response: X-Current-Sequence: 101

3. Mobile Client syncs (last_sync_sequence = 95)
   → GET /api/sync/operations?since=95
   → Receives operations 96-101 (including Desktop's upload)
   → last_sync_sequence = 101

4. Mobile tries to delete image
   → DELETE /api/images/5
   → Headers: X-Last-Sync-Sequence: 100
   → Server: seq=100, current=101 → REJECT 409 ✗
   → Response: "1 operation behind. Sync first."

5. Mobile syncs
   → GET /api/sync/operations?since=100
   → Receives operation 101
   → last_sync_sequence = 101

6. Mobile retries delete
   → DELETE /api/images/5
   → Headers: X-Last-Sync-Sequence: 101
   → Server: seq=101, current=101 → ACCEPT ✓
   → New sequence: 102
```

## Batch Operations

When performing batch operations, the system creates a parent record and links child operations:

```sql
-- Batch parent (sequence 100)
INSERT INTO sync_log (operation, image_id, status, metadata)
VALUES ('batch_delete', NULL, 'in_progress', '{"total_count": 3}');

-- Child operations (sequences 101, 102, 103)
INSERT INTO sync_log (operation, image_id, group_operation_id, status)
VALUES
  ('delete', 1, 100, 'completed'),
  ('delete', 2, 100, 'completed'),
  ('delete', 3, 100, 'failed');

-- Update parent summary
UPDATE sync_log SET status = 'completed',
  metadata = '{"total_count": 3, "success_count": 2, "failed_count": 1}'
WHERE id = 100;
```

## Response Headers

All responses include sync information in headers:

| Header | Description | Example |
|--------|-------------|---------|
| `X-Current-Sequence` | Server's current sequence | `150` |
| `X-Client-Sequence` | Client's provided sequence | `145` |
| `X-Operations-Behind` | How many operations behind | `5` |

## Best Practices

### For Clients

1. **Store sync sequence persistently** - Save to local storage/database
2. **Sync before write operations** - Reduces conflicts
3. **Handle 409 gracefully** - Sync and retry automatically
4. **Sync periodically** - Poll every 30-60 seconds when idle
5. **Use incremental sync** - Only fetch since last sequence

### For Server

1. **Never skip sequences** - BIGSERIAL ensures monotonic increase
2. **Log operations atomically** - Within same transaction as data change
3. **Include client context** - User agent, IP for debugging
4. **Batch parent first** - Create before child operations
5. **Update batch summaries** - After all children complete

## Troubleshooting

### Client sequence ahead of server

```
Error: "Invalid sync state: Client sequence is ahead of server"
```

**Cause:** Client has invalid/corrupted sync state

**Solution:** Reset client's sync sequence to 0 and perform full sync

### Missing operations

```
Client: "I synced to 100, but getting 409 at 100"
Server: "I'm at sequence 105"
```

**Cause:** Client didn't process operations 101-105

**Solution:** Check `/api/sync/operations?since=100` and apply missing operations

### Stale batch operations

```
Status: Batch parent shows "in_progress" but completed hours ago
```

**Cause:** Server crashed before updating batch summary

**Solution:** Run cleanup job to mark stale batches as failed

## Migration Guide

To apply the sync system to an existing database:

```bash
# Run migration
psql -d postgres -f database/migrations/001_add_sync_tracking_columns.sql

# Or for new deployments, it's already in init schema
psql -d postgres -f database/init/01-init-schema.sql
```

## Architecture Diagram

```
┌─────────────┐                  ┌─────────────┐
│   Client A  │                  │   Client B  │
│  (Desktop)  │                  │   (Mobile)  │
└──────┬──────┘                  └──────┬──────┘
       │                                │
       │ POST /api/images/upload        │
       │ X-Last-Sync-Sequence: 100      │
       │                                │
       ▼                                ▼
┌────────────────────────────────────────────────┐
│              Sync Middleware                   │
│  1. Extract client_id, last_sync_sequence      │
│  2. Get current_sequence from DB               │
│  3. If last == current → ACCEPT (fast-forward) │
│  4. If last < current → REJECT 409 (conflict)  │
└────────────┬───────────────────────────────────┘
             │ ACCEPT
             ▼
┌────────────────────────────────────────────────┐
│              Image Controller                  │
│  1. Perform operation (upload/delete/etc)      │
│  2. Log to sync_log with new sequence          │
│  3. Return X-Current-Sequence in headers       │
└────────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────┐
│              sync_log Table                    │
│  sync_sequence | operation | image_id | client │
│  ──────────────┼───────────┼──────────┼────────│
│       101      │  upload   │    5     │ Client A│
│       102      │  delete   │    3     │ Client B│
│       103      │  update   │    5     │ Client A│
└────────────────────────────────────────────────┘
```
