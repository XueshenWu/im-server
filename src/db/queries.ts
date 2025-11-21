import { eq, desc, sql, and, isNull, inArray } from 'drizzle-orm';
import { db } from './index';
import { images, exifData, syncLog, type NewImage, type NewExifData, type NewSyncLog } from './schema';

// ============================================================
// IMAGE QUERIES
// ============================================================

/**
 * Get all images (non-deleted)
 */
export async function getAllImages() {
  return await db
    .select()
    .from(images)
    .where(isNull(images.deletedAt))
    .orderBy(desc(images.createdAt));
}

/**
 * Get images with EXIF data
 */
export async function getImagesWithExif() {
  return await db
    .select()
    .from(images)
    .leftJoin(exifData, eq(images.id, exifData.imageId))
    .where(isNull(images.deletedAt))
    .orderBy(desc(images.createdAt));
}

/**
 * Get single image by ID
 */
export async function getImageById(id: number) {
  const result = await db
    .select()
    .from(images)
    .where(and(eq(images.id, id), isNull(images.deletedAt)))
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
    .where(and(eq(images.uuid, uuid), isNull(images.deletedAt)))
    .limit(1);

  return result[0] || null;
}

/**
 * Get image by hash (for duplicate detection)
 */
export async function getImageByHash(hash: string) {
  const result = await db
    .select()
    .from(images)
    .where(and(eq(images.hash, hash), isNull(images.deletedAt)))
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
export async function getExifByImageId(imageId: number) {
  const result = await db
    .select()
    .from(exifData)
    .where(eq(exifData.imageId, imageId))
    .limit(1);

  return result[0] || null;
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
export async function updateExifData(imageId: number, exif: Partial<NewExifData>) {
  const result = await db
    .update(exifData)
    .set({ ...exif, updatedAt: new Date() })
    .where(eq(exifData.imageId, imageId))
    .returning();

  return result[0] || null;
}

/**
 * Delete EXIF data
 */
export async function deleteExifData(imageId: number) {
  await db
    .delete(exifData)
    .where(eq(exifData.imageId, imageId));
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
export async function getImageWithExif(id: number) {
  const image = await getImageById(id);
  if (!image) return null;

  const exif = await getExifByImageId(id);

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
  exifDataInput?: Omit<NewExifData, 'imageId'>
) {
  const newImage = await createImage(imageData);

  if (exifDataInput) {
    const exif = await createExifData({
      ...exifDataInput,
      imageId: newImage.id,
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
 * Replace image by UUID (preserves UUID, ID, createdAt, collections)
 * Updates file metadata and optionally EXIF data
 */
export async function replaceImageByUuid(
  uuid: string,
  imageData: Partial<NewImage>,
  exifDataInput?: Omit<NewExifData, 'imageId'>
) {
  // Get existing image
  const existingImage = await getImageByUuid(uuid);
  if (!existingImage) {
    throw new Error('Image not found');
  }

  // Update image metadata (preserve UUID, ID, createdAt)
  const updatedImage = await db
    .update(images)
    .set({
      ...imageData,
      updatedAt: new Date(),
    })
    .where(eq(images.uuid, uuid))
    .returning();

  // Handle EXIF data
  if (exifDataInput) {
    const existingExif = await getExifByImageId(existingImage.id);

    if (existingExif) {
      // Update existing EXIF data
      const updatedExif = await updateExifData(existingImage.id, exifDataInput);
      return {
        ...updatedImage[0],
        exifData: updatedExif,
      };
    } else {
      // Create new EXIF data
      const newExif = await createExifData({
        ...exifDataInput,
        imageId: existingImage.id,
      });
      return {
        ...updatedImage[0],
        exifData: newExif,
      };
    }
  } else {
    // Delete EXIF data if it exists (new image has no EXIF)
    await deleteExifData(existingImage.id);
  }

  return {
    ...updatedImage[0],
    exifData: null,
  };
}
