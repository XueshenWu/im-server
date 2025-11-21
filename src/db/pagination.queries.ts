import { db } from './index';
import { images, imageCollections } from './schema';
import { eq, isNull, and, lt, gt, desc, asc, sql, SQL } from 'drizzle-orm';

export type SortField = 'name' | 'size' | 'type' | 'updatedAt' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface PaginationParams {
  limit?: number;
  cursor?: string; // Base64 encoded cursor (image ID)
  collectionId?: number;
  sortBy?: SortField;
  sortOrder?: SortOrder;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PagePaginationParams {
  page?: number;
  pageSize?: number;
  collectionId?: number;
  sortBy?: SortField;
  sortOrder?: SortOrder;
}

export interface PagePaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Helper function to get the sort column based on sortBy parameter
 */
function getSortColumn(sortBy?: SortField) {
  switch (sortBy) {
    case 'name':
      return images.originalName;
    case 'size':
      return images.fileSize;
    case 'type':
      return images.format;
    case 'updatedAt':
      return images.updatedAt;
    default:
      return images.id;
  }
}

/**
 * Helper function to get the order function (asc or desc)
 */
function getOrderFunction(sortOrder?: SortOrder) {
  return sortOrder === 'asc' ? asc : desc;
}

/**
 * Get paginated images with cursor-based pagination
 * Supports filtering by collection and sorting
 */
export async function getPaginatedImages(params: PaginationParams): Promise<PaginatedResult<any>> {
  const limit = Math.min(params.limit || 20, 100); // Max 100 items per page
  const cursor = params.cursor ? parseInt(Buffer.from(params.cursor, 'base64').toString('utf-8')) : null;

  const sortColumn = getSortColumn(params.sortBy);
  const orderFn = getOrderFunction(params.sortOrder);

  let query;

  if (params.collectionId) {
    // Get images from a specific collection
    const conditions = [
      eq(imageCollections.collectionId, params.collectionId),
      isNull(images.deletedAt),
    ];

    if (cursor) {
      conditions.push(lt(images.id, cursor));
    }

    query = db
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
        updatedAt: images.updatedAt,
        addedToCollectionAt: imageCollections.addedAt,
      })
      .from(imageCollections)
      .innerJoin(images, eq(imageCollections.imageId, images.id))
      .where(and(...conditions))
      .orderBy(orderFn(sortColumn))
      .limit(limit + 1); // Fetch one extra to check if there are more
  } else {
    // Get all images
    const conditions = [isNull(images.deletedAt)];

    if (cursor) {
      conditions.push(lt(images.id, cursor));
    }

    query = db
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
        updatedAt: images.updatedAt,
      })
      .from(images)
      .where(and(...conditions))
      .orderBy(orderFn(sortColumn))
      .limit(limit + 1);
  }

  const results = await query;

  // Check if there are more results
  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;

  // Generate next cursor from the last item's ID
  const nextCursor = hasMore && data.length > 0
    ? Buffer.from(data[data.length - 1].id.toString()).toString('base64')
    : null;

  return {
    data,
    nextCursor,
    hasMore,
  };
}

/**
 * Get paginated images with EXIF data
 */
export async function getPaginatedImagesWithExif(params: PaginationParams): Promise<PaginatedResult<any>> {
  const limit = Math.min(params.limit || 20, 100);
  const cursor = params.cursor ? parseInt(Buffer.from(params.cursor, 'base64').toString('utf-8')) : null;

  const sortColumn = getSortColumn(params.sortBy);
  const orderFn = getOrderFunction(params.sortOrder);

  const conditions = [isNull(images.deletedAt)];

  if (cursor) {
    conditions.push(lt(images.id, cursor));
  }

  if (params.collectionId) {
    // For collection filtering with EXIF, we need a subquery
    const subquery = db
      .select({ imageId: imageCollections.imageId })
      .from(imageCollections)
      .where(eq(imageCollections.collectionId, params.collectionId));

    conditions.push(sql`${images.id} IN ${subquery}`);
  }

  const results = await db.query.images.findMany({
    where: and(...conditions),
    orderBy: [orderFn(sortColumn)],
    limit: limit + 1,
    with: {
      exifData: true,
    },
  });

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;

  const nextCursor = hasMore && data.length > 0
    ? Buffer.from(data[data.length - 1].id.toString()).toString('base64')
    : null;

  return {
    data,
    nextCursor,
    hasMore,
  };
}

/**
 * Get paginated images with page-based pagination
 * Supports filtering by collection and sorting
 */
export async function getPagePaginatedImages(params: PagePaginationParams): Promise<PagePaginatedResult<any>> {
  const page = Math.max(params.page || 1, 1); // Ensure page >= 1
  const pageSize = Math.min(Math.max(params.pageSize || 20, 1), 100); // Between 1-100
  const offset = (page - 1) * pageSize;

  const sortColumn = getSortColumn(params.sortBy);
  const orderFn = getOrderFunction(params.sortOrder);

  let dataQuery;
  let countQuery;

  if (params.collectionId) {
    // Get images from a specific collection
    const conditions = [
      eq(imageCollections.collectionId, params.collectionId),
      isNull(images.deletedAt),
    ];

    dataQuery = db
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
        updatedAt: images.updatedAt,
        addedToCollectionAt: imageCollections.addedAt,
      })
      .from(imageCollections)
      .innerJoin(images, eq(imageCollections.imageId, images.id))
      .where(and(...conditions))
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset(offset);

    // Count total items in collection
    countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(imageCollections)
      .innerJoin(images, eq(imageCollections.imageId, images.id))
      .where(and(...conditions));
  } else {
    // Get all images
    const conditions = [isNull(images.deletedAt)];

    dataQuery = db
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
        updatedAt: images.updatedAt,
      })
      .from(images)
      .where(and(...conditions))
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset(offset);

    // Count total items
    countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(images)
      .where(and(...conditions));
  }

  const [data, countResult] = await Promise.all([
    dataQuery,
    countQuery,
  ]);

  const totalItems = countResult[0]?.count || 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    data,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Get paginated images with EXIF data using page-based pagination
 */
export async function getPagePaginatedImagesWithExif(params: PagePaginationParams): Promise<PagePaginatedResult<any>> {
  const page = Math.max(params.page || 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize || 20, 1), 100);
  const offset = (page - 1) * pageSize;

  const sortColumn = getSortColumn(params.sortBy);
  const orderFn = getOrderFunction(params.sortOrder);

  const conditions = [isNull(images.deletedAt)];

  if (params.collectionId) {
    const subquery = db
      .select({ imageId: imageCollections.imageId })
      .from(imageCollections)
      .where(eq(imageCollections.collectionId, params.collectionId));

    conditions.push(sql`${images.id} IN ${subquery}`);
  }

  // Get data
  const data = await db.query.images.findMany({
    where: and(...conditions),
    orderBy: [orderFn(sortColumn)],
    limit: pageSize,
    offset: offset,
    with: {
      exifData: true,
    },
  });

  // Count total items
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(images)
    .where(and(...conditions));

  const totalItems = countResult[0]?.count || 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    data,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}
