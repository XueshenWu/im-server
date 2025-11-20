import { Request, Response } from 'express';
import {
  getAllImages,
  getImageById,
  getImageByUuid,
  updateImage,
  softDeleteImage,
  getImageStats,
  getImagesWithExif,
  createImageWithExif,
  getImageByHash,
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

    if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
      throw new AppError('Invalid limit. Must be between 1 and 100', 400);
    }

    if (collectionId && isNaN(collectionId)) {
      throw new AppError('Invalid collection ID', 400);
    }

    const result = withExif
      ? await getPaginatedImagesWithExif({ limit, cursor, collectionId })
      : await getPaginatedImages({ limit, cursor, collectionId });

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

    if (page && (isNaN(page) || page < 1)) {
      throw new AppError('Invalid page number. Must be >= 1', 400);
    }

    if (pageSize && (isNaN(pageSize) || pageSize < 1 || pageSize > 100)) {
      throw new AppError('Invalid page size. Must be between 1 and 100', 400);
    }

    if (collectionId && isNaN(collectionId)) {
      throw new AppError('Invalid collection ID', 400);
    }

    const result = withExif
      ? await getPagePaginatedImagesWithExif({ page, pageSize, collectionId })
      : await getPagePaginatedImages({ page, pageSize, collectionId });

    res.json({
      success: true,
      count: result.data.length,
      data: result.data,
      pagination: result.pagination,
    });
  }
}

export const imagesController = new ImagesController();
