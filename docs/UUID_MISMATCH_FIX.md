# UUID Mismatch Issue - Local Mode Push/Pull

## Problem
When pushing local images then pulling, all images are deleted and re-downloaded despite being identical files.

## Root Cause
**Client-side issue**: Local mode client is NOT sending UUIDs when uploading images.

## Server Status
✅ Server correctly accepts client UUIDs via `req.body.uuids` (JSON array)
✅ Server preserves client UUIDs if provided ([images.controller.ts:606-608](../src/controllers/images.controller.ts#L606-L608))
✅ Database schema supports custom UUIDs ([schema.ts:6](../src/db/schema.ts#L6))

## Solution (Client-Side)
When pushing images from local mode, send UUIDs in the upload request:

```typescript
// In local sync push logic
const formData = new FormData();
formData.append('images', file);

// REQUIRED: Send local UUIDs as JSON array
const uuids = localImages.map(img => img.uuid);
formData.append('uuids', JSON.stringify(uuids));

await fetch('/api/images/upload', {
  method: 'POST',
  body: formData
});
```

## Expected Flow
1. Local creates image with `uuid: "abc-123-local"`
2. Push sends: `uuids: ["abc-123-local"]`
3. Server creates image with UUID `"abc-123-local"` (preserved)
4. Pull matches by UUID → No deletion/re-download ✅

## Server Implementation Details
- UUIDs validated with regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- Array length must match number of files
- If not provided, server generates random UUID (current behavior)
