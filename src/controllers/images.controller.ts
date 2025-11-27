import { Request, Response } from 'express';
import {
  getAllImages,
  getImageById,
  getImageByUuid,
  getImagesByUuids,
  getImagesWithExifByUuids,
  softDeleteImage,
  batchSoftDeleteImagesByUuid,
  getImageStats,
  getImagesWithExif,
  createImageWithExif,
  getImageByHash,
  replaceImageByUuid,
  getImagesSinceSequence,
  insertPendingImages,
  getExifByImageUUID,
  createExifData,
  updateExifData,
} from '../db/queries';
import { getPaginatedImages, getPaginatedImagesWithExif, getPagePaginatedImages, getPagePaginatedImagesWithExif } from '../db/pagination.queries';
import { AppError } from '../middleware/errorHandler';
import {
  createBatchOperation,
  updateBatchOperationSummary,
  logSuccessfulOperation,
  logFailedOperation,
  getCurrentSyncSequence,
} from '../utils/syncLogger';
import { getClientId } from '../middleware/syncValidation';
import { Image, NewImage } from '../db/schema';
import { generatePresignedUrl, generatePresignedGetUrl, getThumbnailStream } from '../config/minio';

/**
 * Sanitize EXIF data from user input
 * Removes fields that should be auto-generated or determined server-side
 */
function sanitizeExifData(rawExifData: any) {
  const {
    id,           // Auto-generated primary key
    imageId,      // Determined from UUID
    ...cleanExifData
  } = rawExifData;
  return cleanExifData;
}

export class ImagesController {

  // Get all images
  async getAll(req: Request, res: Response) {
    const sinceParam = req.query.since as string | undefined;

    let images;
    if (sinceParam) {
      // Incremental sync: get images modified since the given sequence
      const sinceSequence = parseInt(sinceParam);

      if (isNaN(sinceSequence)) {
        throw new AppError('Invalid "since" parameter', 400);
      }

      // Get images modified after the given sync sequence
      // We need to fetch from sync_log to find images touched after that sequence
      images = await getImagesSinceSequence(sinceSequence);
    } else {
      images = await getAllImages();
    }

    const currentSequence = await getCurrentSyncSequence();

    res.json({
      success: true,
      count: images.length,
      data: images,
      currentSequence,
      hasMore: false, // For full sync this is always false; could be enhanced with pagination
    });
  }

  // Get images with EXIF data
  getAllWithExif = async (req: Request, res: Response) => {
    const images = await getImagesWithExif();
    res.json({
      success: true,
      count: images.length,
      data: images,
    });
  }

  // Get minimal metadata for all images (for efficient sync state comparison)
  async getMetadata(req: Request, res: Response) {
    const sinceParam = req.query.since as string | undefined;

    let images;
    if (sinceParam) {
      const sinceSequence = parseInt(sinceParam);

      if (isNaN(sinceSequence)) {
        throw new AppError('Invalid "since" parameter', 400);
      }

      images = await getImagesSinceSequence(sinceSequence);
    } else {
      images = await getAllImages();
    }

    const currentSequence = await getCurrentSyncSequence();

    // Return only minimal metadata for efficient comparison
    const metadata = images.map(img => ({
      uuid: img.uuid,
      hash: img.hash,
      updatedAt: img.updatedAt,
      fileSize: img.fileSize,
    }));

    res.json({
      success: true,
      count: metadata.length,
      currentSequence,
      data: metadata,
    });
  }


  // Get single image by UUID
  async getByUuid(req: Request, res: Response) {
    const { uuid } = req.params;
    const image = await getImageByUuid(uuid);

    if (!image) {
      throw new AppError('Image not found', 404);
    }

    res.json({
      success: true,
      data: image,
    });
  }

  // Get image statistics
  async getStats(req: Request, res: Response) {
    const stats = await getImageStats();
    res.json({
      success: true,
      data: stats,
    });
  }


  // Soft delete image
  delete = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      throw new AppError('Invalid image ID', 400);
    }

    const deletedImage = await softDeleteImage(id);

    if (!deletedImage) {
      throw new AppError('Image not found', 404);
    }

    // Log deletion to sync log
    const clientId = getClientId(req);
    await logSuccessfulOperation({
      operation: 'delete',
      imageId: id,
      clientId,
      metadata: {
        filename: deletedImage.filename,
        uuid: deletedImage.uuid,
      },
    });

    res.json({
      success: true,
      message: 'Image deleted successfully',
      data: deletedImage,
    });
  }



  // Unified delete handler - accepts array, handles single or batch based on length
  async batchDeleteByUuids(req: Request, res: Response) {
    const { uuids } = req.body;

    if (!Array.isArray(uuids) || uuids.length === 0) {
      throw new AppError('Invalid request. Provide an array of image UUIDs', 400);
    }

    // Validate all UUIDs are strings
    const validUuids = uuids.filter(uuid => typeof uuid === 'string' && uuid.length > 0);

    if (validUuids.length === 0) {
      throw new AppError('No valid image UUIDs provided', 400);
    }

    const clientId = getClientId(req);
    const isBatchOperation = validUuids.length > 1;

    // Create batch operation parent if batch
    let batchOperation;
    if (isBatchOperation) {
      batchOperation = await createBatchOperation({
        operation: 'batch_delete',
        clientId,
        totalCount: validUuids.length,
        metadata: {
          request_source: 'api',
          delete_by: 'uuids',
        },
      });
    }

    const deletedImages = await batchSoftDeleteImagesByUuid(validUuids);

    // Log each successful deletion
    for (const deletedImage of deletedImages) {
      await logSuccessfulOperation({
        operation: 'delete',
        imageId: deletedImage.id,
        clientId,
        groupOperationId: isBatchOperation ? batchOperation!.id : undefined,
        metadata: {
          uuid: deletedImage.uuid,
          filename: deletedImage.filename,
        },
      });
    }

    // Log failed deletions
    const failedCount = validUuids.length - deletedImages.length;
    const deletedUuids = new Set(deletedImages.map(img => img.uuid));
    for (const uuid of validUuids) {
      if (!deletedUuids.has(uuid)) {
        if (isBatchOperation) {
          await logFailedOperation({
            operation: 'delete',
            clientId,
            groupOperationId: batchOperation!.id,
            errorMessage: 'Image not found or already deleted',
            metadata: {
              uuid,
            },
          });
        }
      }
    }

    // Update batch operation summary if batch
    if (isBatchOperation) {
      await updateBatchOperationSummary(
        batchOperation!.id,
        deletedImages.length,
        failedCount
      );
    }

    res.json({
      success: true,
      message: isBatchOperation
        ? `Soft deleted ${deletedImages.length} of ${validUuids.length} images`
        : 'Image deleted successfully',
      data: {
        deleted: deletedImages,
        stats: {
          requested: validUuids.length,
          successful: deletedImages.length,
          failed: validUuids.length - deletedImages.length,
        },
      },
    });
  }

  // Unified update EXIF handler - accepts array, handles single or batch based on length
  async UpdateExifData(req: Request, res: Response) {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new AppError('Invalid request. Provide an array of EXIF updates', 400);
    }

    // Validate all updates have UUID and exifData
    for (const update of updates) {
      if (!update.uuid || typeof update.uuid !== 'string') {
        throw new AppError('Each update must have a valid UUID', 400);
      }
      if (!update.exifData) {
        throw new AppError('Each update must have exifData', 400);
      }
    }

    const clientId = getClientId(req);
    const isBatchOperation = updates.length > 1;

    // Batch fetch all images and their EXIF data in one query
    const uuids = updates.map(u => u.uuid);
    const imagesWithExif = await getImagesWithExifByUuids(uuids);

    // Create a map for quick lookup
    const imageMap = new Map(imagesWithExif.map(item => [
      item.images.uuid,
      { image: item.images, exif: item.exif_data }
    ]));

    // Create batch operation parent if batch
    let batchOperation;
    if (isBatchOperation) {
      batchOperation = await createBatchOperation({
        operation: 'batch_update_exif',
        clientId,
        totalCount: updates.length,
        metadata: {
          request_source: 'api',
        },
      });
    }

    const updatedImages = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { uuid, exifData: rawExifData } = update;
        const imageData = imageMap.get(uuid);

        if (!imageData) {
          errors.push({
            uuid,
            error: 'Image not found',
          });
          if (isBatchOperation) {
            await logFailedOperation({
              operation: 'update_exif',
              clientId,
              groupOperationId: batchOperation!.id,
              errorMessage: 'Image not found',
              metadata: { uuid },
            });
          }
          continue;
        }

        const { image, exif: existingExif } = imageData;

        // Sanitize EXIF data
        const exifData = sanitizeExifData(rawExifData);

        // Update or create EXIF data
        let updatedExif;
        if (existingExif) {
          updatedExif = await updateExifData(image.uuid, exifData);
        } else {
          updatedExif = await createExifData({ ...exifData, uuid: image.uuid });
        }

        updatedImages.push({
          ...image,
          exifData: updatedExif,
        });

        // Log successful update
        await logSuccessfulOperation({
          operation: 'update_exif',
          imageId: image.id,
          clientId,
          groupOperationId: isBatchOperation ? batchOperation!.id : undefined,
          metadata: {
            uuid: image.uuid,
            updated_fields: Object.keys(exifData),
          },
        });
      } catch (error: any) {
        errors.push({
          uuid: update.uuid,
          error: error.message || 'Unknown error',
        });

        if (isBatchOperation) {
          await logFailedOperation({
            operation: 'update_exif',
            clientId,
            groupOperationId: batchOperation!.id,
            errorMessage: error.message || 'Unknown error',
            metadata: {
              uuid: update.uuid,
            },
          });
        }
      }
    }

    // Update batch operation summary if batch
    if (isBatchOperation) {
      await updateBatchOperationSummary(
        batchOperation!.id,
        updatedImages.length,
        errors.length
      );
    }

    res.json({
      success: true,
      message: isBatchOperation
        ? `Updated ${updatedImages.length} of ${updates.length} images`
        : 'EXIF data updated successfully',
      data: {
        updated: updatedImages,
        stats: {
          requested: updates.length,
          successful: updatedImages.length,
          failed: errors.length,
        },
        errors,
      },
    });
  }


  // Request download URLs - Get image metadata, EXIF, and presigned GET URLs
  async requestDownloadUrls(req: Request, res: Response) {
    const { uuids } = req.body;
    const expiry = req.query.expiry ? parseInt(req.query.expiry as string) : 3600; // Default 1 hour

    if (!Array.isArray(uuids) || uuids.length === 0) {
      throw new AppError('Invalid request. Provide an array of image UUIDs', 400);
    }

    // Validate all UUIDs are strings
    const validUuids = uuids.filter(uuid => typeof uuid === 'string' && uuid.length > 0);

    if (validUuids.length === 0) {
      throw new AppError('No valid image UUIDs provided', 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const uuid of validUuids) {
      if (!uuidRegex.test(uuid)) {
        throw new AppError(`Invalid UUID format: ${uuid}`, 400);
      }
    }

    // Fetch images with EXIF data
    const imagesWithExif = await getImagesWithExifByUuids(validUuids);

    const results = [];
    const errors = [];

    for (const uuid of validUuids) {
      try {
        const imageData = imagesWithExif.find(item => item.images.uuid === uuid);

        if (!imageData) {
          errors.push({
            uuid,
            error: 'Image not found',
          });
          continue;
        }

        const { images: image, exif_data: exifData } = imageData;

        // Generate presigned GET URL
        const downloadUrl = await generatePresignedGetUrl(image.uuid, image.format, expiry);

        results.push({
          uuid: image.uuid,
          filename: image.filename,
          downloadUrl,
          expiresIn: expiry,
          metadata: {
            id: image.id,
            format: image.format,
            fileSize: image.fileSize,
            width: image.width,
            height: image.height,
            hash: image.hash,
            mimeType: image.mimeType,
            isCorrupted: image.isCorrupted,
            createdAt: image.createdAt,
            updatedAt: image.updatedAt,
          },
          exifData: exifData || null,
        });
      } catch (error: any) {
        errors.push({
          uuid,
          error: error.message || 'Unknown error',
        });
      }
    }

    res.json({
      success: true,
      count: results.length,
      data: {
        downloads: results,
        stats: {
          requested: validUuids.length,
          successful: results.length,
          failed: errors.length,
        },
        errors,
      },
    });
  }

  presignURLs = async (req: Request, res: Response) => {

    // image.exifData is optional here
    const { images } = req.body;

    if (!Array.isArray(images) || images.length === 0) {
      throw new AppError('No files uploaded', 400);
    }

    await insertPendingImages(images);


    const signedUrls = (await Promise.allSettled(images.map((image: Image) => {
      if (!image.mimeType) {
        throw new AppError(`Missing mimeType for image ${image.uuid}`, 400);
      }
      return generatePresignedUrl(image.uuid, image.mimeType);
    }))).map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {}
      }
    })
    console.log(`presigned URLs: ${JSON.stringify(signedUrls)}`)
    res.json({
      success: true,
      data: signedUrls
    });
  }




  // Get paginated images with cursor-based pagination
  getPaginated = async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const cursor = req.query.cursor as string | undefined;
    const collectionId = req.query.collectionId ? parseInt(req.query.collectionId as string) : undefined;
    const withExif = req.query.withExif === 'true';
    const sortBy = req.query.sortBy as 'name' | 'size' | 'type' | 'updatedAt' | 'createdAt' | undefined;
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined;

    if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
      throw new AppError('Invalid limit. Must be between 1 and 100', 400);
    }

    if (collectionId && isNaN(collectionId)) {
      throw new AppError('Invalid collection ID', 400);
    }

    if (sortBy && !['name', 'size', 'type', 'updatedAt', 'createdAt'].includes(sortBy)) {
      throw new AppError('Invalid sortBy. Must be one of: name, size, type, updatedAt', 400);
    }

    if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
      throw new AppError('Invalid sortOrder. Must be either asc or desc', 400);
    }

    const result = withExif
      ? await getPaginatedImagesWithExif({ limit, cursor, collectionId, sortBy, sortOrder })
      : await getPaginatedImages({ limit, cursor, collectionId, sortBy, sortOrder });

    res.json({
      success: true,
      count: result.data.length,
      data: result.data,
      pagination: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        limit,
      },
    });
  }

  getImagesByUUID = async (req: Request, res: Response) => {
    const { uuids } = req.body;
    const withExif = req.query.withExif === 'true';

    if (!Array.isArray(uuids) || uuids.length === 0) {
      throw new AppError('Invalid request. Provide an array of image UUIDs', 400);
    }

    // Validate all UUIDs are strings and have valid format
    const validUuids = uuids.filter(uuid => typeof uuid === 'string' && uuid.length > 0);

    if (validUuids.length === 0) {
      throw new AppError('No valid image UUIDs provided', 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const uuid of validUuids) {
      if (!uuidRegex.test(uuid)) {
        throw new AppError(`Invalid UUID format: ${uuid}`, 400);
      }
    }

    const images = withExif
      ? await getImagesWithExifByUuids(validUuids)
      : await getImagesByUuids(validUuids);

    res.json({
      success: true,
      count: images.length,
      requested: validUuids.length,
      data: images,
    });
  }

  // Get paginated images with page-based pagination
  getPagePaginated = async (req: Request, res: Response) => {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 20;
    const collectionId = req.query.collectionId ? parseInt(req.query.collectionId as string) : undefined;
    const withExif = req.query.withExif === 'true';
    const sortBy = req.query.sortBy as 'name' | 'size' | 'type' | 'updatedAt' | 'createdAt' | undefined;
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined;

    if (page && (isNaN(page) || page < 1)) {
      throw new AppError('Invalid page number. Must be >= 1', 400);
    }

    if (pageSize && (isNaN(pageSize) || pageSize < 1 || pageSize > 100)) {
      throw new AppError('Invalid page size. Must be between 1 and 100', 400);
    }

    if (collectionId && isNaN(collectionId)) {
      throw new AppError('Invalid collection ID', 400);
    }

    if (sortBy && !['name', 'size', 'type', 'updatedAt', 'createdAt'].includes(sortBy)) {
      throw new AppError('Invalid sortBy. Must be one of: name, size, type, updatedAt', 400);
    }

    if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
      throw new AppError('Invalid sortOrder. Must be either asc or desc', 400);
    }

    const result = withExif
      ? await getPagePaginatedImagesWithExif({ page, pageSize, collectionId, sortBy, sortOrder })
      : await getPagePaginatedImages({ page, pageSize, collectionId, sortBy, sortOrder });

    res.json({
      success: true,
      count: result.data.length,
      data: result.data,
      pagination: result.pagination,
    });
  }

  // Get image file by ID - returns presigned URL for download
  async getFileById(req: Request, res: Response) {
    const id = parseInt(req.params.id);
    const expiry = req.query.expiry ? parseInt(req.query.expiry as string) : 3600; // Default 1 hour

    if (isNaN(id)) {
      throw new AppError('Invalid image ID', 400);
    }

    const image = await getImageById(id);

    if (!image) {
      throw new AppError('Image not found', 404);
    }

    // Generate presigned GET URL for the image
    const presignedUrl = await generatePresignedGetUrl(image.uuid, image.format, expiry);

    res.json({
      success: true,
      data: {
        uuid: image.uuid,
        filename: image.filename,
        url: presignedUrl,
        expiresIn: expiry,
        metadata: {
          id: image.id,
          format: image.format,
          fileSize: image.fileSize,
          width: image.width,
          height: image.height,
          hash: image.hash,
          mimeType: image.mimeType,
          isCorrupted: image.isCorrupted,
          createdAt: image.createdAt,
          updatedAt: image.updatedAt,
        },
      },
    });
  }

  // Get image file by UUID - returns presigned URL for download
  async getFileByUuid(req: Request, res: Response) {
    const { uuid } = req.params;
    const expiry = req.query.expiry ? parseInt(req.query.expiry as string) : 3600; // Default 1 hour

    const image = await getImageByUuid(uuid);

    if (!image) {
      throw new AppError('Image not found', 404);
    }

    // Generate presigned GET URL for the image
    const presignedUrl = await generatePresignedGetUrl(image.uuid, image.format, expiry);

    res.json({
      success: true,
      data: {
        uuid: image.uuid,
        filename: image.filename,
        presignedUrl: presignedUrl,
        expiresIn: expiry,
        metadata: {
          id: image.id,
          format: image.format,
          fileSize: image.fileSize,
          width: image.width,
          height: image.height,
          hash: image.hash,
          mimeType: image.mimeType,
          isCorrupted: image.isCorrupted,
          createdAt: image.createdAt,
          updatedAt: image.updatedAt,
        },
      },
    });
  }



  // Unified replace handler - accepts array, handles single or batch based on length
  async replaceImages(req: Request, res: Response) {
    const { replacements } = req.body;

    // Validate input
    if (!Array.isArray(replacements) || replacements.length === 0) {
      throw new AppError('Invalid request. Provide an array of image replacements', 400);
    }

    // Validate each replacement has required fields
    for (const replacement of replacements) {
      if (!replacement.uuid || !replacement.filename || !replacement.format || !replacement.mimeType) {
        throw new AppError('Each replacement must have uuid, filename, format, and mimeType', 400);
      }
    }

    const clientId = getClientId(req);
    const isBatchOperation = replacements.length > 1;

    // Create batch operation parent if batch
    let batchOperation;
    if (isBatchOperation) {
      batchOperation = await createBatchOperation({
        operation: 'batch_replace',
        clientId,
        totalCount: replacements.length,
        metadata: {
          request_source: 'api',
        },
      });
    }

    const results = [];
    const errors = [];

    for (const replacement of replacements) {
      try {
        const { uuid, filename, format, mimeType, width, height, fileSize, hash, exifData: rawExifData } = replacement;

        // Check if image exists
        const existingImage = await getImageByUuid(uuid);
        if (!existingImage) {
          errors.push({
            uuid,
            error: 'Image not found',
          });
          if (isBatchOperation) {
            await logFailedOperation({
              operation: 'replace',
              clientId,
              groupOperationId: batchOperation!.id,
              errorMessage: 'Image not found',
              metadata: { uuid },
            });
          }
          continue;
        }

        // Prepare image data for replacement
        const imageData = {
          filename,
          format,
          mimeType,
          width: width || null,
          height: height || null,
          fileSize: fileSize || null,
          hash: hash || null,
        };

        // Sanitize EXIF data if provided
        const exifData = rawExifData ? sanitizeExifData(rawExifData) : undefined;

        // Update image metadata in database (with EXIF if provided)
        const replacedImage = await replaceImageByUuid(uuid, imageData, exifData);

        // Generate presigned URLs for client to upload replacement image and thumbnail
        const presignedUrls = await generatePresignedUrl(uuid, mimeType);

        // Log replacement initiation to sync log
        await logSuccessfulOperation({
          operation: 'replace',
          imageId: existingImage.id,
          clientId,
          groupOperationId: isBatchOperation ? batchOperation!.id : undefined,
          metadata: {
            uuid,
            old_filename: existingImage.filename,
            old_format: existingImage.format,
            new_filename: filename,
            new_format: format,
            status: 'pending',
            has_exif_update: !!exifData,
          },
        });

        results.push({
          image: replacedImage,
          uploadUrls: {
            imageUrl: presignedUrls.imageUrl,
            thumbnailUrl: presignedUrls.thumbnailUrl,
            expiresIn: 900, // 15 minutes
          },
        });
      } catch (error: any) {
        errors.push({
          uuid: replacement.uuid,
          error: error.message || 'Unknown error',
        });

        if (isBatchOperation) {
          await logFailedOperation({
            operation: 'replace',
            clientId,
            groupOperationId: batchOperation!.id,
            errorMessage: error.message || 'Unknown error',
            metadata: {
              uuid: replacement.uuid,
            },
          });
        }
      }
    }

    // Update batch operation summary if batch
    if (isBatchOperation) {
      await updateBatchOperationSummary(
        batchOperation!.id,
        results.length,
        errors.length
      );
    }

    res.json({
      success: true,
      message: isBatchOperation
        ? `Replaced ${results.length} of ${replacements.length} images`
        : 'Metadata updated, ready for client upload',
      data: {
        replaced: results,
        stats: {
          requested: replacements.length,
          successful: results.length,
          failed: errors.length,
        },
        errors,
      },
    });
  }

}
export const imagesController = new ImagesController();
