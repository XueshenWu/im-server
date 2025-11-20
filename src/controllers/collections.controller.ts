import { Request, Response } from 'express';
import {
  getAllCollections,
  getCollectionById,
  getCollectionByUuid,
  createCollection,
  updateCollection,
  softDeleteCollection,
  getImagesInCollection,
  addImageToCollection,
  removeImageFromCollection,
  getCollectionsForImage,
  getCollectionStats,
} from '../db/collections.queries';
import { getImageById } from '../db/queries';
import { AppError } from '../middleware/errorHandler';

export class CollectionsController {
  /**
   * Get all collections
   * GET /api/collections
   */
  async getAll(req: Request, res: Response) {
    const collections = await getAllCollections();

    // Get stats for each collection
    const collectionsWithStats = await Promise.all(
      collections.map(async (collection) => {
        const stats = await getCollectionStats(collection.id);
        return {
          ...collection,
          imageCount: stats.imageCount,
        };
      })
    );

    res.json({
      success: true,
      count: collectionsWithStats.length,
      data: collectionsWithStats,
    });
  }

  /**
   * Get collection by ID
   * GET /api/collections/:id
   */
  async getById(req: Request, res: Response) {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      throw new AppError('Invalid collection ID', 400);
    }

    const collection = await getCollectionById(id);

    if (!collection) {
      throw new AppError('Collection not found', 404);
    }

    const stats = await getCollectionStats(id);

    res.json({
      success: true,
      data: {
        ...collection,
        imageCount: stats.imageCount,
      },
    });
  }

  /**
   * Get collection by UUID
   * GET /api/collections/uuid/:uuid
   */
  async getByUuid(req: Request, res: Response) {
    const { uuid } = req.params;
    const collection = await getCollectionByUuid(uuid);

    if (!collection) {
      throw new AppError('Collection not found', 404);
    }

    const stats = await getCollectionStats(collection.id);

    res.json({
      success: true,
      data: {
        ...collection,
        imageCount: stats.imageCount,
      },
    });
  }

  /**
   * Create a new collection
   * POST /api/collections
   */
  async create(req: Request, res: Response) {
    const { name, description, coverImageId } = req.body;

    if (!name) {
      throw new AppError('Collection name is required', 400);
    }

    // Validate cover image exists if provided
    if (coverImageId) {
      const coverImage = await getImageById(coverImageId);
      if (!coverImage) {
        throw new AppError('Cover image not found', 404);
      }
    }

    const newCollection = await createCollection({
      name,
      description: description || null,
      coverImageId: coverImageId || null,
    });

    res.status(201).json({
      success: true,
      message: 'Collection created successfully',
      data: {
        ...newCollection,
        imageCount: 0,
      },
    });
  }

  /**
   * Update collection
   * PUT /api/collections/:id
   */
  async update(req: Request, res: Response) {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      throw new AppError('Invalid collection ID', 400);
    }

    const { name, description, coverImageId } = req.body;

    // Validate cover image exists if provided
    if (coverImageId) {
      const coverImage = await getImageById(coverImageId);
      if (!coverImage) {
        throw new AppError('Cover image not found', 404);
      }
    }

    const updatedCollection = await updateCollection(id, {
      name,
      description,
      coverImageId,
    });

    if (!updatedCollection) {
      throw new AppError('Collection not found', 404);
    }

    const stats = await getCollectionStats(id);

    res.json({
      success: true,
      message: 'Collection updated successfully',
      data: {
        ...updatedCollection,
        imageCount: stats.imageCount,
      },
    });
  }

  /**
   * Delete collection (soft delete)
   * DELETE /api/collections/:id
   */
  async delete(req: Request, res: Response) {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      throw new AppError('Invalid collection ID', 400);
    }

    const deletedCollection = await softDeleteCollection(id);

    if (!deletedCollection) {
      throw new AppError('Collection not found', 404);
    }

    res.json({
      success: true,
      message: 'Collection deleted successfully',
      data: deletedCollection,
    });
  }

  /**
   * Get images in collection
   * GET /api/collections/:id/images
   */
  async getImages(req: Request, res: Response) {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      throw new AppError('Invalid collection ID', 400);
    }

    // Verify collection exists
    const collection = await getCollectionById(id);
    if (!collection) {
      throw new AppError('Collection not found', 404);
    }

    const images = await getImagesInCollection(id);

    res.json({
      success: true,
      count: images.length,
      data: images,
    });
  }

  /**
   * Add image to collection
   * POST /api/collections/:id/images
   */
  async addImage(req: Request, res: Response) {
    const collectionId = parseInt(req.params.id);
    const { imageId } = req.body;

    if (isNaN(collectionId)) {
      throw new AppError('Invalid collection ID', 400);
    }

    if (!imageId || isNaN(parseInt(imageId))) {
      throw new AppError('Valid image ID is required', 400);
    }

    // Verify collection exists
    const collection = await getCollectionById(collectionId);
    if (!collection) {
      throw new AppError('Collection not found', 404);
    }

    // Verify image exists
    const image = await getImageById(parseInt(imageId));
    if (!image) {
      throw new AppError('Image not found', 404);
    }

    const result = await addImageToCollection(parseInt(imageId), collectionId);

    res.status(201).json({
      success: true,
      message: 'Image added to collection',
      data: result,
    });
  }

  /**
   * Remove image from collection
   * DELETE /api/collections/:id/images/:imageId
   */
  async removeImage(req: Request, res: Response) {
    const collectionId = parseInt(req.params.id);
    const imageId = parseInt(req.params.imageId);

    if (isNaN(collectionId)) {
      throw new AppError('Invalid collection ID', 400);
    }

    if (isNaN(imageId)) {
      throw new AppError('Invalid image ID', 400);
    }

    const result = await removeImageFromCollection(imageId, collectionId);

    if (!result) {
      throw new AppError('Image not found in collection', 404);
    }

    res.json({
      success: true,
      message: 'Image removed from collection',
    });
  }

  /**
   * Get collections containing a specific image
   * GET /api/images/:imageId/collections
   */
  async getCollectionsForImage(req: Request, res: Response) {
    const imageId = parseInt(req.params.imageId);

    if (isNaN(imageId)) {
      throw new AppError('Invalid image ID', 400);
    }

    // Verify image exists
    const image = await getImageById(imageId);
    if (!image) {
      throw new AppError('Image not found', 404);
    }

    const collections = await getCollectionsForImage(imageId);

    res.json({
      success: true,
      count: collections.length,
      data: collections,
    });
  }
}

export const collectionsController = new CollectionsController();
