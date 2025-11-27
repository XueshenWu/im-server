/**
 * BACKLOG: Deprecated ID-based Image Controller Handlers
 *
 * This file contains handlers that are deprecated:
 * - ID-based endpoints (replaced with UUID-based)
 * - Not yet implemented features
 *
 * These are kept for reference but should not be used in production.
 */

import { Request, Response } from 'express';
import { AppError } from '../middleware/errorHandler';
import {
  getImageById,
  softDeleteImage,
  batchSoftDeleteImages,
} from '../db/queries';
import {
  logSuccessfulOperation,
  logFailedOperation,
  createBatchOperation,
  updateBatchOperationSummary,
} from '../utils/syncLogger';
import { getClientId } from '../middleware/syncValidation';
import { generatePresignedGetUrl } from '../config/minio';

export class ImagesControllerBacklog {

  /**
   * DEPRECATED: ID-based get single image
   * Use GET /uuid/:uuid instead
   * Route: GET /:id
   */
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

  /**
   * DEPRECATED: ID-based delete
   * Use DELETE /uuid/:uuid instead
   * Route: DELETE /:id
   */
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

  /**
   * DEPRECATED: ID-based batch delete
   * Use POST /batch/delete/uuids instead
   * Route: POST /batch/delete/ids
   */
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

  /**
   * DEPRECATED: ID-based file retrieval
   * Use GET /file/uuid/:uuid instead
   * Route: GET /file/:id
   */
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

  /**
   * NOT IMPLEMENTED: Batch upload from folder configuration
   * Status: Not implemented (returns 501)
   * Route: POST /batch
   */
  batchUpload = async (req: Request, res: Response) => {
    // TODO: Implement batch upload from folder config JSON
    res.status(501).json({
      success: false,
      message: 'Batch upload endpoint not yet implemented',
    });
  }
}

export const imagesControllerBacklog = new ImagesControllerBacklog();
