import { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import {
  getAllImages,
  getImageById,
  getImageByUuid,
  getImagesByUuids,
  getImagesWithExifByUuids,
  updateImage,
  updateImageByUuid,
  softDeleteImage,
  batchSoftDeleteImages,
  batchSoftDeleteImagesByUuid,
  getImageStats,
  getImagesWithExif,
  createImageWithExif,
  getImageByHash,
  replaceImageByUuid,
  getImagesSinceSequence,
  insertPendingImages,
} from '../db/queries';
import { getPaginatedImages, getPaginatedImagesWithExif, getPagePaginatedImages, getPagePaginatedImagesWithExif } from '../db/pagination.queries';
import { AppError } from '../middleware/errorHandler';
import {
  processImage,
  generateThumbnail,
  extractExifData,
  getFileExtension,
} from '../utils/imageProcessor';
import { getImagePaths, getTempImagePaths, IMAGES_DIR, THUMBNAILS_DIR } from '../middleware/upload';
import logger from '../config/logger';
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

  // Get single image by ID
  async getById(req: Request, res: Response) {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      throw new AppError('Invalid image ID', 400);
    }

    const image = await getImageById(id);

    if (!image) {
      throw new AppError('Image not found', 404);
    }

    res.json({
      success: true,
      data: image,
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

  // Update image
  async update(req: Request, res: Response) {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      throw new AppError('Invalid image ID', 400);
    }

    const updatedImage = await updateImage(id, req.body);

    if (!updatedImage) {
      throw new AppError('Image not found', 404);
    }

    // Log update to sync log
    const clientId = getClientId(req);
    await logSuccessfulOperation({
      operation: 'update',
      imageId: id,
      clientId,
      metadata: {
        updated_fields: Object.keys(req.body),
        filename: updatedImage.filename,
      },
    });

    res.json({
      success: true,
      data: updatedImage,
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

  // Batch soft delete images by IDs
  async batchDeleteByIds(req: Request, res: Response) {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError('Invalid request. Provide an array of image IDs', 400);
    }

    // Validate all IDs are numbers
    const validIds = ids.filter(id => typeof id === 'number' && !isNaN(id));

    if (validIds.length === 0) {
      throw new AppError('No valid image IDs provided', 400);
    }

    const clientId = getClientId(req);

    // Create batch operation parent
    const batchOperation = await createBatchOperation({
      operation: 'batch_delete',
      clientId,
      totalCount: validIds.length,
      metadata: {
        request_source: 'api',
        delete_by: 'ids',
      },
    });

    const deletedImages = await batchSoftDeleteImages(validIds);

    // Log each successful deletion
    for (const deletedImage of deletedImages) {
      await logSuccessfulOperation({
        operation: 'delete',
        imageId: deletedImage.id,
        clientId,
        groupOperationId: batchOperation.id,
        metadata: {
          filename: deletedImage.filename,
          uuid: deletedImage.uuid,
        },
      });
    }

    // Log failed deletions
    const failedCount = validIds.length - deletedImages.length;
    const deletedIds = new Set(deletedImages.map(img => img.id));
    for (const id of validIds) {
      if (!deletedIds.has(id)) {
        await logFailedOperation({
          operation: 'delete',
          imageId: id,
          clientId,
          groupOperationId: batchOperation.id,
          errorMessage: 'Image not found or already deleted',
        });
      }
    }

    // Update batch operation summary
    await updateBatchOperationSummary(
      batchOperation.id,
      deletedImages.length,
      failedCount
    );

    res.json({
      success: true,
      message: `Soft deleted ${deletedImages.length} of ${validIds.length} images`,
      data: {
        deleted: deletedImages,
        stats: {
          requested: validIds.length,
          successful: deletedImages.length,
          failed: validIds.length - deletedImages.length,
        },
      },
    });
  }

  // Batch soft delete images by UUIDs
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

    // Create batch operation parent
    const batchOperation = await createBatchOperation({
      operation: 'batch_delete',
      clientId,
      totalCount: validUuids.length,
      metadata: {
        request_source: 'api',
        delete_by: 'uuids',
      },
    });

    const deletedImages = await batchSoftDeleteImagesByUuid(validUuids);

    // Log each successful deletion
    for (const deletedImage of deletedImages) {
      await logSuccessfulOperation({
        operation: 'delete',
        imageId: deletedImage.id,
        clientId,
        groupOperationId: batchOperation.id,
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
        await logFailedOperation({
          operation: 'delete',
          clientId,
          groupOperationId: batchOperation.id,
          errorMessage: 'Image not found or already deleted',
          metadata: {
            uuid,
          },
        });
      }
    }

    // Update batch operation summary
    await updateBatchOperationSummary(
      batchOperation.id,
      deletedImages.length,
      failedCount
    );

    res.json({
      success: true,
      message: `Soft deleted ${deletedImages.length} of ${validUuids.length} images`,
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

  // Batch update image metadata by UUIDs
  async batchUpdate(req: Request, res: Response) {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new AppError('Invalid request. Provide an array of image updates', 400);
    }

    // Validate all updates have UUID
    for (const update of updates) {
      if (!update.uuid || typeof update.uuid !== 'string') {
        throw new AppError('Each update must have a valid UUID', 400);
      }
    }

    const clientId = getClientId(req);

    // Create batch operation parent
    const batchOperation = await createBatchOperation({
      operation: 'batch_update',
      clientId,
      totalCount: updates.length,
      metadata: {
        request_source: 'api',
      },
    });

    const updatedImages = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { uuid, ...updateData } = update;

        // Only allow specific fields to be updated
        const allowedFields: Partial<NewImage> = {};
        if (updateData.filename) allowedFields.filename = updateData.filename;

        if (Object.keys(allowedFields).length === 0) {
          errors.push({
            uuid,
            error: 'No valid fields to update',
          });
          continue;
        }

        // Update the image
        const updatedImage = await updateImageByUuid(uuid, allowedFields);

        if (!updatedImage) {
          errors.push({
            uuid,
            error: 'Image not found',
          });
          await logFailedOperation({
            operation: 'update',
            clientId,
            groupOperationId: batchOperation.id,
            errorMessage: 'Image not found',
            metadata: { uuid },
          });
          continue;
        }

        updatedImages.push(updatedImage);

        // Log successful update
        await logSuccessfulOperation({
          operation: 'update',
          imageId: updatedImage.id,
          clientId,
          groupOperationId: batchOperation.id,
          metadata: {
            uuid: updatedImage.uuid,
            updated_fields: Object.keys(allowedFields),
          },
        });
      } catch (error: any) {
        errors.push({
          uuid: update.uuid,
          error: error.message || 'Unknown error',
        });

        await logFailedOperation({
          operation: 'update',
          clientId,
          groupOperationId: batchOperation.id,
          errorMessage: error.message || 'Unknown error',
          metadata: {
            uuid: update.uuid,
          },
        });
      }
    }

    // Update batch operation summary
    await updateBatchOperationSummary(
      batchOperation.id,
      updatedImages.length,
      errors.length
    );

    res.json({
      success: true,
      message: `Updated ${updatedImages.length} of ${updates.length} images`,
      data: {
        updated: updatedImages,
        stats: {
          requested: updates.length,
          successful: updatedImages.length,
          failed: errors.length,
        },
        errors,
      },
    }); 1
  }


  presignURLs = async (req: Request, res: Response) => {
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


  // Upload single or multiple images
  upload = async (req: Request, res: Response) => {
    if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
      throw new AppError('No files uploaded', 400);
    }

    const files = Array.isArray(req.files) ? req.files : [req.files.images];
    const uploadedImages = [];
    const errors = [];
    const clientId = getClientId(req);

    // Extract client-provided UUIDs if present
    const clientUuids = req.body.uuids ? JSON.parse(req.body.uuids) : null;

    // Validate UUIDs if provided
    if (clientUuids) {
      if (!Array.isArray(clientUuids)) {
        throw new AppError('uuids must be an array', 400);
      }
      if (clientUuids.length !== files.flat().length) {
        throw new AppError('Number of UUIDs must match number of files', 400);
      }
      // Basic UUID format validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const uuid of clientUuids) {
        if (!uuidRegex.test(uuid)) {
          throw new AppError(`Invalid UUID format: ${uuid}`, 400);
        }
      }
    }

    // Create batch operation if multiple files
    const flatFiles = files.flat();
    let batchOperation = null;
    if (flatFiles.length > 1) {
      batchOperation = await createBatchOperation({
        operation: 'batch_upload',
        clientId,
        totalCount: flatFiles.length,
        metadata: {
          request_source: 'api',
          user_agent: req.get('user-agent'),
          ip_address: req.ip,
        },
      });
    }
    for (let i = 0; i < flatFiles.length; i++) {
      const file = flatFiles[i];
      const tempFilePath = path.join(IMAGES_DIR, file.filename);

      try {
        // Process image and get metadata from temp file
        const imageMetadata = await processImage(tempFilePath);

        // Check for duplicates by hash
        const existingImage = await getImageByHash(imageMetadata.hash);
        if (existingImage) {
          // Delete temp file
          await fs.unlink(tempFilePath).catch(() => { });
          errors.push({
            filename: file.originalname,
            error: 'Duplicate image (already exists)',
            hash: imageMetadata.hash,
          });
          continue;
        }

        // Extract EXIF data
        let exifData = null;
        if (!imageMetadata.isCorrupted) {
          exifData = await extractExifData(tempFilePath);
        }

        // Prepare image data
        const format = getFileExtension(file.originalname);
        const imageData: any = {
          filename: file.originalname, // Store original filename for display
          fileSize: imageMetadata.size,
          format: format,
          width: imageMetadata.width || null,
          height: imageMetadata.height || null,
          hash: imageMetadata.hash,
          mimeType: file.mimetype,
          isCorrupted: imageMetadata.isCorrupted,
        };

        // Use client-provided UUID if available
        if (clientUuids && clientUuids[i]) {
          imageData.uuid = clientUuids[i];
        }

        // Create image with EXIF data (UUID will be auto-generated if not provided)
        const newImage = await createImageWithExif(imageData, exifData || undefined);

        // Rename temp file to UUID-based filename
        const { imagePath, thumbnailPath } = getImagePaths(newImage.uuid, format);
        await fs.rename(tempFilePath, imagePath);

        // Generate thumbnail if image is not corrupted
        if (!imageMetadata.isCorrupted) {
          try {
            await generateThumbnail(imagePath, thumbnailPath);
          } catch (error) {
            logger.error('Error generating thumbnail:', error);
          }
        }

        uploadedImages.push(newImage);

        // Log successful upload to sync log
        await logSuccessfulOperation({
          operation: 'upload',
          imageId: newImage.id,
          clientId,
          groupOperationId: batchOperation?.id,
          metadata: {
            original_filename: file.originalname,
            file_size: imageMetadata.size,
            file_hash: imageMetadata.hash,
            is_corrupted: imageMetadata.isCorrupted,
          },
        });
      } catch (error: any) {
        errors.push({
          filename: file.originalname,
          error: error.message || 'Unknown error',
        });

        // Log failed upload to sync log
        await logFailedOperation({
          operation: 'upload',
          clientId,
          groupOperationId: batchOperation?.id,
          errorMessage: error.message || 'Unknown error',
          metadata: {
            original_filename: file.originalname,
          },
        });
      }
    }

    // Update batch operation summary if it was a batch
    if (batchOperation) {
      await updateBatchOperationSummary(
        batchOperation.id,
        uploadedImages.length,
        errors.length
      );
    }

    res.status(201).json({
      success: true,
      message: `Uploaded ${uploadedImages.length} of ${flatFiles.length} images`,
      data: {
        uploaded: uploadedImages,
        failed: errors,
        stats: {
          total: flatFiles.length,
          successful: uploadedImages.length,
          failed: errors.length,
          corrupted: uploadedImages.filter(img => img.isCorrupted).length,
        },
      },
    });
  }

  // Batch upload from folder configuration
  batchUpload = async (req: Request, res: Response) => {
    // TODO: Implement batch upload from folder config JSON
    res.status(501).json({
      success: false,
      message: 'Batch upload endpoint not yet implemented',
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

  // Get thumbnail by UUID - streams directly from MinIO
  async getThumbnailByUuid(req: Request, res: Response) {
    const { uuid } = req.params;

    const image = await getImageByUuid(uuid);

    if (!image) {
      throw new AppError('Image not found', 404);
    }

    try {
      // Get thumbnail stream from MinIO
      const stream = await getThumbnailStream(image.uuid);

      // Set content type header
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

      // Pipe the stream to the response
      stream.pipe(res);

      stream.on('error', (error) => {
        logger.error('Error streaming thumbnail:', error);
        if (!res.headersSent) {
          throw new AppError('Thumbnail not found', 404);
        }
      });
    } catch (error: any) {
      if (error.code === 'NotFound') {
        throw new AppError('Thumbnail not found', 404);
      }
      throw new AppError('Error retrieving thumbnail', 500);
    }
  }

  // Replace image by UUID - Update metadata and generate presigned URLs
  async replaceImage(req: Request, res: Response) {
    const { uuid } = req.params;
    const { filename, format, mimeType, width, height, fileSize, hash } = req.body;

    // Validate required fields
    if (!filename || !format || !mimeType) {
      throw new AppError('filename, format, and mimeType are required', 400);
    }

    // Check if image exists
    const existingImage = await getImageByUuid(uuid);
    if (!existingImage) {
      throw new AppError('Image not found', 404);
    }

    // Prepare image data for replacement
    // Note: status, updatedAt, and deletedAt are handled by replaceImageByUuid
    const imageData = {
      filename,
      format,
      mimeType,
      width: width || null,
      height: height || null,
      fileSize: fileSize || null,
      hash: hash || null,
    };

    // Update image metadata in database
    const replacedImage = await replaceImageByUuid(uuid, imageData, undefined);

    // Generate presigned URLs for client to upload replacement image and thumbnail
    const presignedUrls = await generatePresignedUrl(uuid, mimeType);

    // Log replacement initiation to sync log
    const clientId = getClientId(req);
    await logSuccessfulOperation({
      operation: 'replace',
      imageId: existingImage.id,
      clientId,
      metadata: {
        uuid,
        old_filename: existingImage.filename,
        old_format: existingImage.format,
        new_filename: filename,
        new_format: format,
        status: 'pending',
      },
    });

    res.json({
      success: true,
      message: 'Metadata updated, ready for client upload',
      data: {
        image: replacedImage,
        uploadUrls: {
          imageUrl: presignedUrls.imageUrl,
          thumbnailUrl: presignedUrls.thumbnailUrl,
          expiresIn: 900, // 15 minutes
        },
      },
    });
  }
}

export const imagesController = new ImagesController();
