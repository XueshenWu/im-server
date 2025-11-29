import { eq, desc, sql, and, isNull, inArray } from 'drizzle-orm';
import { db } from './index';
import { images, exifData, syncLog, type NewImage, type NewExifData, type NewSyncLog, Image, NewImageWithExif } from './schema';
import { uuid } from 'drizzle-orm/pg-core';

// ============================================================
// IMAGE QUERIES
// ============================================================

/**
 * Helper: Filter for visible images (not deleted, status = 'processed')
 */
const isVisibleImage = () => and(
  isNull(images.deletedAt),
  eq(images.status, 'processed'),
);

/**
 * Get all images (non-deleted, processed only)
 */
export async function getAllImages() {
  return await db
    .select()
    .from(images)
    .where(isVisibleImage())
    .orderBy(desc(images.createdAt));
}

/**
 * Get images modified since a given timestamp
 */
export async function getImagesSince(sinceDate: Date) {
  return await db
    .select()
    .from(images)
    .where(
      and(
        isVisibleImage(),
        sql`${images.updatedAt} > ${sinceDate}`
      )
    )
    .orderBy(desc(images.updatedAt));
}

/**
 * Get images affected by sync operations since a given sequence number
 * This includes newly created, updated, and non-deleted images
 */
export async function getImagesSinceSequence(sinceSequence: number) {
  // Get all imageIds from sync operations after the sequence
  const affectedOperations = await db
    .select({
      imageId: syncLog.imageId,
    })
    .from(syncLog)
    .where(sql`${syncLog.syncSequence} > ${sinceSequence}`)
    .groupBy(syncLog.imageId);

  const imageIds = affectedOperations
    .map(op => op.imageId)
    .filter((id): id is number => id !== null);

  if (imageIds.length === 0) {
    return [];
  }

  // Fetch the actual images (exclude deleted and non-processed ones)
  return await db
    .select()
    .from(images)
    .where(
      and(
        inArray(images.id, imageIds),
        isVisibleImage()
      )
    )
    .orderBy(desc(images.updatedAt));
}

/**
 * Get images with EXIF data
 */
export async function getImagesWithExif() {
  const res = await db
    .select()
    .from(images)
    .leftJoin(exifData, eq(images.uuid, exifData.uuid))
    .where(isVisibleImage())
    .orderBy(desc(images.createdAt));

  return res;
}

/**
 * Get single image by ID
 */
export async function getImageById(id: number) {
  const result = await db
    .select()
    .from(images)
    .where(and(eq(images.id, id), isVisibleImage()))
    .limit(1);

  return result[0] || null;
}

/**
 * Get single image by UUID
 */
export async function getImageByUuid(uuid: string) {
  const result = await db
    .select()
    .from(images)
    .where(and(eq(images.uuid, uuid), isVisibleImage()))
    .limit(1);

  return result[0] || null;
}

/**
 * Get multiple images by UUIDs
 */
export async function getImagesByUuids(uuids: string[]) {
  if (uuids.length === 0) return [];

  return await db
    .select()
    .from(images)
    .where(and(inArray(images.uuid, uuids), isVisibleImage()))
    .orderBy(desc(images.createdAt));
}


export async function getImageExifDataByUuids(uuids: string[]) {
  if (uuids.length === 0) return [];

  return await db
    .select()
    .from(exifData)
    .where(and(inArray(exifData.uuid, uuids), isVisibleImage()))
    .orderBy(desc(images.createdAt));
}

/**
 * Get multiple images with EXIF data by UUIDs
 */
export async function getImagesWithExifByUuids(uuids: string[]) {
  if (uuids.length === 0) return [];

  return await db
    .select()
    .from(images)
    .leftJoin(exifData, eq(images.uuid, exifData.uuid))
    .where(and(inArray(images.uuid, uuids), isVisibleImage()))
    .orderBy(desc(images.createdAt));
}

/**
 * Get image by hash (for duplicate detection)
 */
export async function getImageByHash(hash: string) {
  const result = await db
    .select()
    .from(images)
    .where(and(eq(images.hash, hash), isVisibleImage()))
    .limit(1);

  return result[0] || null;
}

/**
 * Create new image
 */
export async function createImage(image: NewImage) {
  const result = await db
    .insert(images)
    .values(image)
    .returning();

  return result[0];
}

/**
 * Create multiple images (batch insert)
 */
export async function createImages(imageList: NewImage[]) {
  return await db
    .insert(images)
    .values(imageList)
    .returning();
}

/**
 * Update image
 */
export async function updateImage(id: number, image: Partial<NewImage>) {
  const result = await db
    .update(images)
    .set({ ...image, updatedAt: new Date() })
    .where(eq(images.id, id))
    .returning();

  return result[0] || null;
}

/**
 * Update image by UUID
 */
export async function updateImageByUuid(uuid: string, image: Partial<NewImage>) {
  const result = await db
    .update(images)
    .set({ ...image, updatedAt: new Date() })
    .where(and(eq(images.uuid, uuid), isNull(images.deletedAt)))
    .returning();

  return result[0] || null;
}

/**
 * Soft delete image (set deletedAt timestamp)
 */
export async function softDeleteImage(id: number) {
  const result = await db
    .update(images)
    .set({ deletedAt: new Date() })
    .where(eq(images.id, id))
    .returning();

  return result[0] || null;
}

/**
 * Batch soft delete images by IDs
 */
export async function batchSoftDeleteImages(ids: number[]) {
  if (ids.length === 0) return [];

  const result = await db
    .update(images)
    .set({ deletedAt: new Date() })
    .where(inArray(images.id, ids))
    .returning();

  return result;
}

/**
 * Batch soft delete images by UUIDs
 */
export async function batchSoftDeleteImagesByUuid(uuids: string[]) {
  if (uuids.length === 0) return [];

  const result = await db
    .update(images)
    .set({ deletedAt: new Date() })
    .where(inArray(images.uuid, uuids))
    .returning();

  return result;
}

/**
 * Hard delete image (permanently remove)
 */
export async function hardDeleteImage(id: number) {
  await db
    .delete(images)
    .where(eq(images.id, id));
}

/**
 * Get images by format
 */
export async function getImagesByFormat(format: string) {
  return await db
    .select()
    .from(images)
    .where(and(eq(images.format, format), isNull(images.deletedAt)))
    .orderBy(desc(images.createdAt));
}

/**
 * Get image statistics
 */
export async function getImageStats() {
  const result = await db
    .select({
      totalCount: sql<number>`count(*)::int`,
      totalSize: sql<number>`sum(${images.fileSize})::bigint`,
      corruptedCount: sql<number>`count(*) filter (where ${images.isCorrupted})::int`,
      jpgCount: sql<number>`count(*) filter (where ${images.format} in ('jpg', 'jpeg'))::int`,
      pngCount: sql<number>`count(*) filter (where ${images.format} = 'png')::int`,
      tifCount: sql<number>`count(*) filter (where ${images.format} in ('tif', 'tiff'))::int`,
    })
    .from(images)
    .where(isNull(images.deletedAt));

  return result[0];
}

// ============================================================
// EXIF DATA QUERIES
// ============================================================

/**
 * Get EXIF data for an image
 */
export async function getExifByImageUUID(uuid: string) {
  const result = await db
    .select()
    .from(exifData)
    .where(eq(exifData.uuid, uuid))
    .limit(1);

  return result[0] || null;
}

export async function getExifByImageUUIDs(uuids: string[]) {
  if (uuids.length === 0) return [];

  return await db
    .select()
    .from(exifData)
    .where(inArray(exifData.uuid, uuids))
    .orderBy(desc(images.createdAt));
}

/**
 * Create EXIF data
 */
export async function createExifData(exif: NewExifData) {
  const result = await db
    .insert(exifData)
    .values(exif)
    .returning();

  return result[0];
}

/**
 * Update EXIF data
 */
export async function updateExifData(uuid: string, exif: Partial<NewExifData>) {
  const result = await db
    .update(exifData)
    .set({ ...exif })
    .where(eq(exifData.uuid, uuid))
    .returning();

  const updatedExif = result[0];
  if (!updatedExif) return null;

  await db
    .update(images)
    .set({
      updatedAt: new Date(),
    })
    .where(eq(images.uuid, uuid))


  return result[0] || null;
}

/**
 * Delete EXIF data
 */
export async function deleteExifData(uuid: string) {
  await db
    .delete(exifData)
    .where(eq(exifData.uuid, uuid));
}

// ============================================================
// SYNC LOG QUERIES
// ============================================================

/**
 * Get recent sync logs
 */
export async function getRecentSyncLogs(limit: number = 100) {
  return await db
    .select()
    .from(syncLog)
    .orderBy(desc(syncLog.createdAt))
    .limit(limit);
}

/**
 * Create sync log entry
 */
export async function createSyncLog(log: NewSyncLog) {
  const result = await db
    .insert(syncLog)
    .values(log)
    .returning();

  return result[0];
}

/**
 * Update sync log status
 */
export async function updateSyncLogStatus(
  id: number,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  errorMessage?: string
) {
  const result = await db
    .update(syncLog)
    .set({
      status,
      errorMessage: errorMessage || null,
      completedAt: status === 'completed' || status === 'failed' ? new Date() : null,
    })
    .where(eq(syncLog.id, id))
    .returning();

  return result[0] || null;
}

/**
 * Get sync logs by status
 */
export async function getSyncLogsByStatus(status: string) {
  return await db
    .select()
    .from(syncLog)
    .where(eq(syncLog.status, status))
    .orderBy(desc(syncLog.createdAt));
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get image with EXIF data by ID
 */
export async function getImageWithExif(uuid: string) {
  const image = await getImageByUuid(uuid);
  if (!image) return null;

  const exif = await getExifByImageUUID(uuid);

  return {
    ...image,
    exifData: exif,
  };
}

/**
 * Create image with EXIF data (transaction)
 */
export async function createImageWithExif(
  imageData: NewImage,
  exifDataInput?: Omit<NewExifData, 'id' | 'uuid'>
) {
  const newImage = await createImage(imageData);

  if (exifDataInput) {
    const exif = await createExifData({
      uuid: newImage.uuid,
      ...sanitizeExifData(exifDataInput),
    });

    return {
      ...newImage,
      exifData: exif,
    };
  }

  return {
    ...newImage,
    exifData: null,
  };
}



/**
 * Helper: Sanitize EXIF data to ensure proper types for database insertion
 */
function sanitizeExifData(exif: any): Omit<NewExifData, 'id' | 'uuid'> {
  const sanitized: any = {};

  // String fields
  if (exif.cameraMake !== undefined) sanitized.cameraMake = String(exif.cameraMake);
  if (exif.cameraModel !== undefined) sanitized.cameraModel = String(exif.cameraModel);
  if (exif.lensModel !== undefined) sanitized.lensModel = String(exif.lensModel);
  if (exif.artist !== undefined) sanitized.artist = String(exif.artist);
  if (exif.copyright !== undefined) sanitized.copyright = String(exif.copyright);
  if (exif.software !== undefined) sanitized.software = String(exif.software);
  if (exif.shutterSpeed !== undefined) sanitized.shutterSpeed = String(exif.shutterSpeed);
  if (exif.aperture !== undefined) sanitized.aperture = String(exif.aperture);
  if (exif.focalLength !== undefined) sanitized.focalLength = String(exif.focalLength);

  // Integer fields
  if (exif.iso !== undefined) {
    const iso = parseInt(String(exif.iso), 10);
    if (!isNaN(iso)) sanitized.iso = iso;
  }
  if (exif.orientation !== undefined) {
    const orientation = parseInt(String(exif.orientation), 10);
    if (!isNaN(orientation)) sanitized.orientation = orientation;
  }

  // Decimal fields
  if (exif.gpsLatitude !== undefined) sanitized.gpsLatitude = String(exif.gpsLatitude);
  if (exif.gpsLongitude !== undefined) sanitized.gpsLongitude = String(exif.gpsLongitude);
  if (exif.gpsAltitude !== undefined) sanitized.gpsAltitude = String(exif.gpsAltitude);

  // Timestamp fields
  if (exif.dateTaken !== undefined) {
    if (exif.dateTaken instanceof Date) {
      sanitized.dateTaken = exif.dateTaken;
    } else if (typeof exif.dateTaken === 'string') {
      const date = new Date(exif.dateTaken);
      if (!isNaN(date.getTime())) sanitized.dateTaken = date;
    }
  }

  // JSONB extra field
  if (exif.extra !== undefined) sanitized.extra = exif.extra;

  return sanitized;
}

export async function insertPendingImages(newImages: NewImageWithExif[]) {
  // Check for existing images by UUID
  const uuids = newImages.map(img => img.uuid).filter((uuid): uuid is string => uuid !== null && uuid !== undefined);

  if (uuids.length > 0) {
    const existingImages = await db
      .select({ uuid: images.uuid })
      .from(images)
      .where(and(
        inArray(images.uuid, uuids),
        isNull(images.deletedAt)
      ));

    if (existingImages.length > 0) {
      const existingUuids = existingImages.map(img => img.uuid);
      throw new Error(`Images with the following UUIDs already exist: ${existingUuids.join(', ')}`);
    }
  }

  // Insert images
  await db.insert(images).values(newImages.map(newImage => {
    const { exifData, ...imageData } = newImage;
    return {
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...imageData
    } as NewImage;
  }));

  // Insert EXIF data for images that have it
  const exifRecords = newImages
    .filter(img => img.exifData && img.uuid)
    .map(img => ({
      uuid: img.uuid!,
      ...sanitizeExifData(img.exifData!)
    } as NewExifData));

  if (exifRecords.length > 0) {
    await db.insert(exifData).values(exifRecords);
  }
}



/**
 * Replace image by UUID (preserves UUID, ID, createdAt, collections)
 * Updates file metadata and optionally EXIF data
 */
export async function replaceImageByUuid(
  uuid: string,
  imageData: Partial<NewImage>,
  exifDataInput?: Omit<NewExifData, 'id' | 'uuid'>
) {
  // Get existing image
  const existingImage = await getImageByUuid(uuid);
  if (!existingImage) {
    throw new Error('Image not found');
  }

  // Update image metadata (preserve UUID, ID, createdAt)
  // Remove fields that shouldn't be in imageData or need special handling
  const { status, updatedAt, deletedAt, ...cleanImageData } = imageData;
  console.log('clean data: ', JSON.stringify({
    ...cleanImageData,
    updatedAt: new Date(),
    status: 'pending',
    deletedAt: null,
  }))
  const updatedImage = await db
    .update(images)
    .set({
      ...cleanImageData,
      updatedAt: new Date(),
      status: 'pending',
      deletedAt: null,
    })
    .where(eq(images.uuid, uuid))
    .returning();

  // Handle EXIF data
  if (exifDataInput) {
    const existingExif = await getExifByImageUUID(existingImage.uuid);
    const sanitizedExif = sanitizeExifData(exifDataInput);

    if (existingExif) {
      // Update existing EXIF data
      const updatedExif = await updateExifData(existingImage.uuid, sanitizedExif);
      return {
        ...updatedImage[0],
        exifData: updatedExif,
      };
    } else {
      // Create new EXIF data
      const newExif = await createExifData({
        uuid: existingImage.uuid,
        ...sanitizedExif,
      });
      return {
        ...updatedImage[0],
        exifData: newExif,
      };
    }
  } else {
    // Delete EXIF data if it exists (new image has no EXIF)
    await deleteExifData(existingImage.uuid);
  }

  return {
    ...updatedImage[0],
    exifData: null,
  };
}
