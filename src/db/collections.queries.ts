import { db } from './index';
import { collections, imageCollections, images } from './schema';
import { eq, isNull, and, desc } from 'drizzle-orm';
import type { NewCollection, NewImageCollection } from './schema';

/**
 * Get all collections (excluding soft-deleted)
 */
export async function getAllCollections() {
  return db
    .select({
      id: collections.id,
      uuid: collections.uuid,
      name: collections.name,
      description: collections.description,
      coverImageId: collections.coverImageId,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
    })
    .from(collections)
    .where(isNull(collections.deletedAt))
    .orderBy(desc(collections.createdAt));
}

/**
 * Get collection by ID
 */
export async function getCollectionById(id: number) {
  const result = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, id), isNull(collections.deletedAt)))
    .limit(1);

  return result[0] || null;
}

/**
 * Get collection by UUID
 */
export async function getCollectionByUuid(uuid: string) {
  const result = await db
    .select()
    .from(collections)
    .where(and(eq(collections.uuid, uuid), isNull(collections.deletedAt)))
    .limit(1);

  return result[0] || null;
}

/**
 * Create a new collection
 */
export async function createCollection(data: NewCollection) {
  const result = await db.insert(collections).values(data).returning();
  return result[0];
}

/**
 * Update collection
 */
export async function updateCollection(id: number, data: Partial<NewCollection>) {
  const result = await db
    .update(collections)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(collections.id, id), isNull(collections.deletedAt)))
    .returning();

  return result[0] || null;
}

/**
 * Soft delete collection
 */
export async function softDeleteCollection(id: number) {
  const result = await db
    .update(collections)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(collections.id, id), isNull(collections.deletedAt)))
    .returning();

  return result[0] || null;
}

/**
 * Get images in a collection
 */
export async function getImagesInCollection(collectionId: number) {
  return db
    .select({
      id: images.id,
      uuid: images.uuid,
      filename: images.filename,
      originalName: images.originalName,
      filePath: images.filePath,
      thumbnailPath: images.thumbnailPath,
      fileSize: images.fileSize,
      format: images.format,
      width: images.width,
      height: images.height,
      hash: images.hash,
      mimeType: images.mimeType,
      isCorrupted: images.isCorrupted,
      createdAt: images.createdAt,
      addedToCollectionAt: imageCollections.addedAt,
    })
    .from(imageCollections)
    .innerJoin(images, eq(imageCollections.imageId, images.id))
    .where(and(
      eq(imageCollections.collectionId, collectionId),
      isNull(images.deletedAt)
    ))
    .orderBy(desc(imageCollections.addedAt));
}

/**
 * Add image to collection
 */
export async function addImageToCollection(imageId: number, collectionId: number) {
  // Check if already exists
  const existing = await db
    .select()
    .from(imageCollections)
    .where(
      and(
        eq(imageCollections.imageId, imageId),
        eq(imageCollections.collectionId, collectionId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const result = await db
    .insert(imageCollections)
    .values({ imageId, collectionId })
    .returning();

  return result[0];
}

/**
 * Remove image from collection
 */
export async function removeImageFromCollection(imageId: number, collectionId: number) {
  const result = await db
    .delete(imageCollections)
    .where(
      and(
        eq(imageCollections.imageId, imageId),
        eq(imageCollections.collectionId, collectionId)
      )
    )
    .returning();

  return result[0] || null;
}

/**
 * Get all collections containing a specific image
 */
export async function getCollectionsForImage(imageId: number) {
  return db
    .select({
      id: collections.id,
      uuid: collections.uuid,
      name: collections.name,
      description: collections.description,
      coverImageId: collections.coverImageId,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
      addedAt: imageCollections.addedAt,
    })
    .from(imageCollections)
    .innerJoin(collections, eq(imageCollections.collectionId, collections.id))
    .where(and(
      eq(imageCollections.imageId, imageId),
      isNull(collections.deletedAt)
    ))
    .orderBy(desc(imageCollections.addedAt));
}

/**
 * Get collection stats (image count)
 */
export async function getCollectionStats(collectionId: number) {
  const imagesInCollection = await db
    .select({ imageId: imageCollections.imageId })
    .from(imageCollections)
    .innerJoin(images, eq(imageCollections.imageId, images.id))
    .where(and(
      eq(imageCollections.collectionId, collectionId),
      isNull(images.deletedAt)
    ));

  return {
    imageCount: imagesInCollection.length,
  };
}
