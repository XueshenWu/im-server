import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { db } from '../db';
import { images, exifData, syncLog } from '../db/schema';
import { AppError } from '../middleware/errorHandler';
import { redisClient } from '../config/redis';
import minioClient from '../config/minio';
import { eq, and, lt, sql } from 'drizzle-orm';

const IMAGES_DIR = './storage/images';
const THUMBNAILS_DIR = './storage/thumbnails';
const CHUNKS_DIR = './storage/chunks';

/**
 * Development-only purge controller
 * WARNING: This will delete ALL data!
 */
export class PurgeController {
  /**
   * Purge all data (files, database records, Redis sessions)
   * DELETE /api/dev/purge
   */
  async purgeAll(req: Request, res: Response) {
    // Safety check: Only allow in development
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('Purge endpoint is disabled in production', 403);
    }

    const BUCKET_IMAGES = process.env.MINIO_BUCKET_IMAGES || 'images';
    const BUCKET_THUMBNAILS = process.env.MINIO_BUCKET_THUMBNAILS || 'thumbnails';

    const results = {
      deletedFiles: 0,
      deletedThumbnails: 0,
      deletedChunks: 0,
      deletedDatabaseRecords: 0,
      deletedRedisSessions: 0,
      deletedMinioImages: 0,
      deletedMinioThumbnails: 0,
      errors: [] as string[],
    };

    try {
      // 1. Delete all files from storage/images
      try {
        const imageFiles = await fs.readdir(IMAGES_DIR);
        for (const file of imageFiles) {
          if (file !== '.gitkeep') {
            await fs.unlink(path.join(IMAGES_DIR, file));
            results.deletedFiles++;
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          results.errors.push(`Failed to delete images: ${error.message}`);
        }
      }

      // 2. Delete all thumbnails from storage/thumbnails
      try {
        const thumbnailFiles = await fs.readdir(THUMBNAILS_DIR);
        for (const file of thumbnailFiles) {
          if (file !== '.gitkeep') {
            await fs.unlink(path.join(THUMBNAILS_DIR, file));
            results.deletedThumbnails++;
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          results.errors.push(`Failed to delete thumbnails: ${error.message}`);
        }
      }

      // 3. Delete all chunk directories from storage/chunks
      try {
        const chunkDirs = await fs.readdir(CHUNKS_DIR);
        for (const dir of chunkDirs) {
          if (dir !== '.gitkeep') {
            await fs.rm(path.join(CHUNKS_DIR, dir), { recursive: true, force: true });
            results.deletedChunks++;
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          results.errors.push(`Failed to delete chunks: ${error.message}`);
        }
      }

      // 4. Delete all database records (in correct order due to foreign keys)
      try {
        // Delete EXIF data first (has foreign key to images)
        await db.delete(exifData);

        // Delete sync logs (has foreign key to images)
        await db.delete(syncLog);

        // Delete images last and get count
        const deletedImages = await db.delete(images).returning();

        results.deletedDatabaseRecords = deletedImages.length;
      } catch (error: any) {
        results.errors.push(`Failed to delete database records: ${error.message}`);
      }

      // 5. Delete all Redis upload sessions
      try {
        const keys = await redisClient.keys('upload:session:*');
        if (keys.length > 0) {
          await redisClient.del(...keys);
          results.deletedRedisSessions = keys.length;
        }
      } catch (error: any) {
        results.errors.push(`Failed to delete Redis sessions: ${error.message}`);
      }

      // 6. Delete all objects from MinIO images bucket
      try {
        const imageStream = minioClient.listObjectsV2(BUCKET_IMAGES, '', true);
        const imageObjects: string[] = [];

        for await (const obj of imageStream) {
          if (obj.name) {
            imageObjects.push(obj.name);
          }
        }

        if (imageObjects.length > 0) {
          await minioClient.removeObjects(BUCKET_IMAGES, imageObjects);
          results.deletedMinioImages = imageObjects.length;
        }
      } catch (error: any) {
        results.errors.push(`Failed to purge MinIO images bucket: ${error.message}`);
      }

      // 7. Delete all objects from MinIO thumbnails bucket
      try {
        const thumbnailStream = minioClient.listObjectsV2(BUCKET_THUMBNAILS, '', true);
        const thumbnailObjects: string[] = [];

        for await (const obj of thumbnailStream) {
          if (obj.name) {
            thumbnailObjects.push(obj.name);
          }
        }

        if (thumbnailObjects.length > 0) {
          await minioClient.removeObjects(BUCKET_THUMBNAILS, thumbnailObjects);
          results.deletedMinioThumbnails = thumbnailObjects.length;
        }
      } catch (error: any) {
        results.errors.push(`Failed to purge MinIO thumbnails bucket: ${error.message}`);
      }

      res.json({
        success: true,
        message: 'Purge completed',
        data: {
          summary: {
            deletedFiles: results.deletedFiles,
            deletedThumbnails: results.deletedThumbnails,
            deletedChunkDirectories: results.deletedChunks,
            deletedDatabaseRecords: results.deletedDatabaseRecords,
            deletedRedisSessions: results.deletedRedisSessions,
            deletedMinioImages: results.deletedMinioImages,
            deletedMinioThumbnails: results.deletedMinioThumbnails,
          },
          errors: results.errors.length > 0 ? results.errors : undefined,
        },
      });
    } catch (error: any) {
      throw new AppError(`Purge failed: ${error.message}`, 500);
    }
  }

  /**
   * Purge only files (keep database records)
   * DELETE /api/dev/purge/files
   */
  async purgeFiles(req: Request, res: Response) {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('Purge endpoint is disabled in production', 403);
    }

    const results = {
      deletedFiles: 0,
      deletedThumbnails: 0,
      deletedChunks: 0,
      errors: [] as string[],
    };

    try {
      // Delete images
      try {
        const imageFiles = await fs.readdir(IMAGES_DIR);
        for (const file of imageFiles) {
          if (file !== '.gitkeep') {
            await fs.unlink(path.join(IMAGES_DIR, file));
            results.deletedFiles++;
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          results.errors.push(`Failed to delete images: ${error.message}`);
        }
      }

      // Delete thumbnails
      try {
        const thumbnailFiles = await fs.readdir(THUMBNAILS_DIR);
        for (const file of thumbnailFiles) {
          if (file !== '.gitkeep') {
            await fs.unlink(path.join(THUMBNAILS_DIR, file));
            results.deletedThumbnails++;
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          results.errors.push(`Failed to delete thumbnails: ${error.message}`);
        }
      }

      // Delete chunks
      try {
        const chunkDirs = await fs.readdir(CHUNKS_DIR);
        for (const dir of chunkDirs) {
          if (dir !== '.gitkeep') {
            await fs.rm(path.join(CHUNKS_DIR, dir), { recursive: true, force: true });
            results.deletedChunks++;
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          results.errors.push(`Failed to delete chunks: ${error.message}`);
        }
      }

      res.json({
        success: true,
        message: 'Files purged (database records preserved)',
        data: {
          summary: {
            deletedFiles: results.deletedFiles,
            deletedThumbnails: results.deletedThumbnails,
            deletedChunkDirectories: results.deletedChunks,
          },
          errors: results.errors.length > 0 ? results.errors : undefined,
        },
      });
    } catch (error: any) {
      throw new AppError(`File purge failed: ${error.message}`, 500);
    }
  }

  /**
   * Purge only database records (keep files)
   * DELETE /api/dev/purge/database
   */
  async purgeDatabase(req: Request, res: Response) {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('Purge endpoint is disabled in production', 403);
    }

    try {
      // Delete in correct order due to foreign keys
      await db.delete(exifData);
      await db.delete(syncLog);
      const deletedImages = await db.delete(images).returning();

      res.json({
        success: true,
        message: 'Database records purged (files preserved)',
        data: {
          deletedRecords: deletedImages.length,
        },
      });
    } catch (error: any) {
      throw new AppError(`Database purge failed: ${error.message}`, 500);
    }
  }

  /**
   * Purge only Redis sessions
   * DELETE /api/dev/purge/redis
   */
  async purgeRedis(req: Request, res: Response) {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('Purge endpoint is disabled in production', 403);
    }

    try {
      const keys = await redisClient.keys('upload:session:*');
      let deletedCount = 0;

      if (keys.length > 0) {
        await redisClient.del(...keys);
        deletedCount = keys.length;
      }

      res.json({
        success: true,
        message: 'Redis sessions purged',
        data: {
          deletedSessions: deletedCount,
        },
      });
    } catch (error: any) {
      throw new AppError(`Redis purge failed: ${error.message}`, 500);
    }
  }

  /**
   * Purge only chunk directories (temporary upload files)
   * DELETE /api/dev/purge/chunks
   */
  async purgeChunks(req: Request, res: Response) {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('Purge endpoint is disabled in production', 403);
    }

    const results = {
      deletedChunks: 0,
      errors: [] as string[],
    };

    try {
      const chunkDirs = await fs.readdir(CHUNKS_DIR);
      for (const dir of chunkDirs) {
        if (dir !== '.gitkeep') {
          await fs.rm(path.join(CHUNKS_DIR, dir), { recursive: true, force: true });
          results.deletedChunks++;
        }
      }

      res.json({
        success: true,
        message: 'Chunk directories purged',
        data: {
          deletedChunkDirectories: results.deletedChunks,
        },
      });
    } catch (error: any) {
      throw new AppError(`Chunk purge failed: ${error.message}`, 500);
    }
  }

  /**
   * Purge all objects from MinIO buckets
   * DELETE /api/dev/purge/minio
   */
  async purgeMinio(req: Request, res: Response) {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('Purge endpoint is disabled in production', 403);
    }

    const BUCKET_IMAGES = process.env.MINIO_BUCKET_IMAGES || 'images';
    const BUCKET_THUMBNAILS = process.env.MINIO_BUCKET_THUMBNAILS || 'thumbnails';

    const results = {
      deletedImages: 0,
      deletedThumbnails: 0,
      errors: [] as string[],
    };

    try {
      // Purge images bucket
      try {
        const imageStream = minioClient.listObjectsV2(BUCKET_IMAGES, '', true);
        const imageObjects: string[] = [];

        for await (const obj of imageStream) {
          if (obj.name) {
            imageObjects.push(obj.name);
          }
        }

        if (imageObjects.length > 0) {
          await minioClient.removeObjects(BUCKET_IMAGES, imageObjects);
          results.deletedImages = imageObjects.length;
        }
      } catch (error: any) {
        results.errors.push(`Failed to purge images bucket: ${error.message}`);
      }

      // Purge thumbnails bucket
      try {
        const thumbnailStream = minioClient.listObjectsV2(BUCKET_THUMBNAILS, '', true);
        const thumbnailObjects: string[] = [];

        for await (const obj of thumbnailStream) {
          if (obj.name) {
            thumbnailObjects.push(obj.name);
          }
        }

        if (thumbnailObjects.length > 0) {
          await minioClient.removeObjects(BUCKET_THUMBNAILS, thumbnailObjects);
          results.deletedThumbnails = thumbnailObjects.length;
        }
      } catch (error: any) {
        results.errors.push(`Failed to purge thumbnails bucket: ${error.message}`);
      }

      res.json({
        success: true,
        message: 'MinIO buckets purged',
        data: {
          summary: {
            deletedImages: results.deletedImages,
            deletedThumbnails: results.deletedThumbnails,
          },
          errors: results.errors.length > 0 ? results.errors : undefined,
        },
      });
    } catch (error: any) {
      throw new AppError(`MinIO purge failed: ${error.message}`, 500);
    }
  }
}

export const purgeController = new PurgeController();
