import { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import {
  getAllImages,
  getImageById,
  getImageByUuid,
  updateImage,
  softDeleteImage,
  batchSoftDeleteImages,
  batchSoftDeleteImagesByUuid,
  getImageStats,
  getImagesWithExif,
  createImageWithExif,
  getImageByHash,
  replaceImageByUuid,
} from '../db/queries';
import { getPaginatedImages, getPaginatedImagesWithExif, getPagePaginatedImages, getPagePaginatedImagesWithExif } from '../db/pagination.queries';
import { AppError } from '../middleware/errorHandler';
import {
  processImage,
  generateThumbnail,
  extractExifData,
  getFileExtension,
} from '../utils/imageProcessor';
import { getImagePaths } from '../middleware/upload';

export class ImagesController {
  // Get all images
  async getAll(req: Request, res: Response) {
    const images = await getAllImages();
    res.json({
      success: true,
      count: images.length,
      data: images,
    });
  }

  // Get images with EXIF data
  async getAllWithExif(req: Request, res: Response) {
    const images = await getImagesWithExif();
    res.json({
      success: true,
      count: images.length,
      data: images,
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

    res.json({
      success: true,
      data: updatedImage,
    });
  }

  // Soft delete image
  async delete(req: Request, res: Response) {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      throw new AppError('Invalid image ID', 400);
    }

    const deletedImage = await softDeleteImage(id);

    if (!deletedImage) {
      throw new AppError('Image not found', 404);
    }

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

    const deletedImages = await batchSoftDeleteImages(validIds);

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

    const deletedImages = await batchSoftDeleteImagesByUuid(validUuids);

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

  // Upload single or multiple images
  async upload(req: Request, res: Response) {
    if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
      throw new AppError('No files uploaded', 400);
    }

    const files = Array.isArray(req.files) ? req.files : [req.files.images];
    const uploadedImages = [];
    const errors = [];

    for (const file of files.flat()) {
      try {
        // Get file paths
        const { imagePath, thumbnailPath, relativeImagePath, relativeThumbnailPath } =
          getImagePaths(file.filename);

        // Process image and get metadata
        const imageMetadata = await processImage(imagePath);

        // Check for duplicates by hash
        const existingImage = await getImageByHash(imageMetadata.hash);
        if (existingImage) {
          errors.push({
            filename: file.originalname,
            error: 'Duplicate image (already exists)',
            hash: imageMetadata.hash,
          });
          continue;
        }

        // Generate thumbnail if image is not corrupted
        let finalThumbnailPath = null;
        if (!imageMetadata.isCorrupted) {
          try {
            await generateThumbnail(imagePath, thumbnailPath);
            finalThumbnailPath = relativeThumbnailPath;
          } catch (error) {
            console.error('Error generating thumbnail:', error);
          }
        }

        // Extract EXIF data
        let exifData = null;
        if (!imageMetadata.isCorrupted) {
          exifData = await extractExifData(imagePath);
        }

        // Prepare image data
        const imageData = {
          filename: file.filename,
          originalName: file.originalname,
          filePath: relativeImagePath,
          thumbnailPath: finalThumbnailPath,
          fileSize: imageMetadata.size,
          format: getFileExtension(file.originalname),
          width: imageMetadata.width || null,
          height: imageMetadata.height || null,
          hash: imageMetadata.hash,
          mimeType: file.mimetype,
          isCorrupted: imageMetadata.isCorrupted,
        };

        // Create image with EXIF data
        const newImage = await createImageWithExif(imageData, exifData || undefined);
        uploadedImages.push(newImage);
      } catch (error: any) {
        errors.push({
          filename: file.originalname,
          error: error.message || 'Unknown error',
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Uploaded ${uploadedImages.length} of ${files.flat().length} images`,
      data: {
        uploaded: uploadedImages,
        failed: errors,
        stats: {
          total: files.flat().length,
          successful: uploadedImages.length,
          failed: errors.length,
          corrupted: uploadedImages.filter(img => img.isCorrupted).length,
        },
      },
    });
  }

  // Batch upload from folder configuration
  async batchUpload(req: Request, res: Response) {
    // TODO: Implement batch upload from folder config JSON
    res.status(501).json({
      success: false,
      message: 'Batch upload endpoint not yet implemented',
    });
  }

  // Get paginated images with cursor-based pagination
  async getPaginated(req: Request, res: Response) {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const cursor = req.query.cursor as string | undefined;
    const collectionId = req.query.collectionId ? parseInt(req.query.collectionId as string) : undefined;
    const withExif = req.query.withExif === 'true';
    const sortBy = req.query.sortBy as 'name' | 'size' | 'type' | 'updatedAt' | undefined;
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined;

    if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
      throw new AppError('Invalid limit. Must be between 1 and 100', 400);
    }

    if (collectionId && isNaN(collectionId)) {
      throw new AppError('Invalid collection ID', 400);
    }

    if (sortBy && !['name', 'size', 'type', 'updatedAt'].includes(sortBy)) {
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

  // Get paginated images with page-based pagination
  async getPagePaginated(req: Request, res: Response) {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 20;
    const collectionId = req.query.collectionId ? parseInt(req.query.collectionId as string) : undefined;
    const withExif = req.query.withExif === 'true';
    const sortBy = req.query.sortBy as 'name' | 'size' | 'type' | 'updatedAt' | undefined;
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

    if (sortBy && !['name', 'size', 'type', 'updatedAt'].includes(sortBy)) {
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

  // Get image file by ID with optional metadata
  async getFileById(req: Request, res: Response) {
    const id = parseInt(req.params.id);
    const includeInfo = req.query.info === 'true';

    if (isNaN(id)) {
      throw new AppError('Invalid image ID', 400);
    }

    const image = await getImageById(id);

    if (!image) {
      throw new AppError('Image not found', 404);
    }

    // Get the absolute file path
    const filePath = path.join(process.cwd(), 'storage', 'images', path.basename(image.filePath));

    // If includeInfo is true, send metadata in headers
    if (includeInfo) {
      res.setHeader('X-Image-Id', image.id.toString());
      res.setHeader('X-Image-UUID', image.uuid);
      res.setHeader('X-Image-Filename', image.filename);
      res.setHeader('X-Image-Original-Name', image.originalName);
      res.setHeader('X-Image-Format', image.format);
      res.setHeader('X-Image-File-Size', image.fileSize.toString());
      if (image.width) res.setHeader('X-Image-Width', image.width.toString());
      if (image.height) res.setHeader('X-Image-Height', image.height.toString());
      res.setHeader('X-Image-Hash', image.hash);
      res.setHeader('X-Image-Created-At', image.createdAt.toISOString());
      res.setHeader('X-Image-Updated-At', image.updatedAt.toISOString());
      if (image.isCorrupted) res.setHeader('X-Image-Is-Corrupted', 'true');
    }

    // Send the file
    res.sendFile(filePath, (err) => {
      if (err) {
        throw new AppError('Error sending file', 500);
      }
    });
  }

  // Get image file by UUID with optional metadata
  async getFileByUuid(req: Request, res: Response) {
    const { uuid } = req.params;
    const includeInfo = req.query.info === 'true';

    const image = await getImageByUuid(uuid);

    if (!image) {
      throw new AppError('Image not found', 404);
    }

    // Get the absolute file path
    const filePath = path.join(process.cwd(), 'storage', 'images', path.basename(image.filePath));

    // If includeInfo is true, send metadata in headers
    if (includeInfo) {
      res.setHeader('X-Image-Id', image.id.toString());
      res.setHeader('X-Image-UUID', image.uuid);
      res.setHeader('X-Image-Filename', image.filename);
      res.setHeader('X-Image-Original-Name', image.originalName);
      res.setHeader('X-Image-Format', image.format);
      res.setHeader('X-Image-File-Size', image.fileSize.toString());
      if (image.width) res.setHeader('X-Image-Width', image.width.toString());
      if (image.height) res.setHeader('X-Image-Height', image.height.toString());
      res.setHeader('X-Image-Hash', image.hash);
      res.setHeader('X-Image-Created-At', image.createdAt.toISOString());
      res.setHeader('X-Image-Updated-At', image.updatedAt.toISOString());
      if (image.isCorrupted) res.setHeader('X-Image-Is-Corrupted', 'true');
    }

    // Send the file
    res.sendFile(filePath, (err) => {
      if (err) {
        throw new AppError('Error sending file', 500);
      }
    });
  }

  // Replace image by UUID
  async replaceImage(req: Request, res: Response) {
    const { uuid } = req.params;

    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    // Check if image exists
    const existingImage = await getImageByUuid(uuid);
    if (!existingImage) {
      throw new AppError('Image not found', 404);
    }

    const file = req.file;

    try {
      // Get file paths for new image
      const { imagePath, thumbnailPath, relativeImagePath, relativeThumbnailPath } =
        getImagePaths(file.filename);

      // Process new image and get metadata
      const imageMetadata = await processImage(imagePath);

      // Generate thumbnail if image is not corrupted
      let finalThumbnailPath = null;
      if (!imageMetadata.isCorrupted) {
        try {
          await generateThumbnail(imagePath, thumbnailPath);
          finalThumbnailPath = relativeThumbnailPath;
        } catch (error) {
          console.error('Error generating thumbnail:', error);
        }
      }

      // Extract EXIF data
      let exifData = null;
      if (!imageMetadata.isCorrupted) {
        exifData = await extractExifData(imagePath);
      }

      // Prepare image data for replacement
      const imageData = {
        filename: file.filename,
        originalName: file.originalname,
        filePath: relativeImagePath,
        thumbnailPath: finalThumbnailPath,
        fileSize: imageMetadata.size,
        format: getFileExtension(file.originalname),
        width: imageMetadata.width || null,
        height: imageMetadata.height || null,
        hash: imageMetadata.hash,
        mimeType: file.mimetype,
        isCorrupted: imageMetadata.isCorrupted,
      };

      // Replace image in database
      const replacedImage = await replaceImageByUuid(uuid, imageData, exifData || undefined);

      // Delete old files (after successful database update)
      try {
        const oldImagePath = path.join(process.cwd(), 'storage', 'images', path.basename(existingImage.filePath));
        await fs.unlink(oldImagePath).catch(() => {
          console.warn(`Could not delete old image file: ${oldImagePath}`);
        });

        if (existingImage.thumbnailPath) {
          const oldThumbnailPath = path.join(process.cwd(), 'storage', 'thumbnails', path.basename(existingImage.thumbnailPath));
          await fs.unlink(oldThumbnailPath).catch(() => {
            console.warn(`Could not delete old thumbnail file: ${oldThumbnailPath}`);
          });
        }
      } catch (error) {
        console.error('Error deleting old files:', error);
        // Don't fail the request if file deletion fails
      }

      res.json({
        success: true,
        message: 'Image replaced successfully',
        data: replacedImage,
      });
    } catch (error: any) {
      // If replacement fails, delete the uploaded file
      try {
        const uploadedPath = path.join(process.cwd(), 'storage', 'images', file.filename);
        await fs.unlink(uploadedPath).catch(() => {});
      } catch {}

      throw new AppError(error.message || 'Failed to replace image', 500);
    }
  }
}

export const imagesController = new ImagesController();
