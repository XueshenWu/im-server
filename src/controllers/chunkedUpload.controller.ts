import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { generateUniqueFilename } from '../utils/imageProcessor';
import {
  processImage,
  generateThumbnail,
  extractExifData,
  getFileExtension,
} from '../utils/imageProcessor';
import { getImagePaths, IMAGES_DIR } from '../middleware/upload';
import { createImageWithExif, getImageByHash, getImageByUuid, replaceImageByUuid } from '../db/queries';
import { redis, getSessionKey, SESSION_TTL, UploadSessionData } from '../config/redis';
import logger from '../config/logger';
import { logSuccessfulOperation } from '../utils/syncLogger';
import { getClientId } from '../middleware/syncValidation';

const CHUNKS_DIR = './storage/chunks';

/**
 * Ensure chunks directory exists
 */
async function ensureChunksDirectory(): Promise<void> {
  try {
    await fs.access(CHUNKS_DIR);
  } catch {
    await fs.mkdir(CHUNKS_DIR, { recursive: true });
  }
}

/**
 * Get session directory path
 */
function getSessionDir(sessionId: string): string {
  return path.join(CHUNKS_DIR, sessionId);
}

/**
 * Get chunk file path
 */
function getChunkPath(sessionId: string, chunkNumber: number): string {
  return path.join(getSessionDir(sessionId), `chunk_${chunkNumber}`);
}

/**
 * Get session from Redis
 */
async function getSession(sessionId: string): Promise<UploadSessionData | null> {
  const key = getSessionKey(sessionId);
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Save session to Redis
 */
async function saveSession(sessionData: UploadSessionData): Promise<void> {
  const key = getSessionKey(sessionData.sessionId);
  await redis.setex(key, SESSION_TTL, JSON.stringify(sessionData));
}

/**
 * Update session in Redis
 */
async function updateSession(sessionId: string, updates: Partial<UploadSessionData>): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new AppError('Session not found', 404);
  }
  const updatedSession = { ...session, ...updates };
  await saveSession(updatedSession);
}

/**
 * Delete session from Redis
 */
async function deleteSession(sessionId: string): Promise<void> {
  const key = getSessionKey(sessionId);
  await redis.del(key);
}

export class ChunkedUploadController {
  /**
   * Initialize a chunked upload session
   * POST /api/images/chunked/init
   */
  async initUpload(req: Request, res: Response) {
    const { filename, totalSize, chunkSize, totalChunks, mimeType } = req.body;

    // Validate required fields
    if (!filename || !totalSize || !chunkSize || !totalChunks) {
      throw new AppError('Missing required fields: filename, totalSize, chunkSize, totalChunks', 400);
    }

    // Validate file type
    const ext = path.extname(filename).toLowerCase();
    const ALLOWED_FORMATS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'];
    if (!ALLOWED_FORMATS.includes(ext)) {
      throw new AppError(`Invalid file format. Allowed formats: ${ALLOWED_FORMATS.join(', ')}`, 400);
    }

    // Validate total size (max 500MB for chunked uploads)
    const MAX_SIZE = 200 * 1024 * 1024;
    if (totalSize > MAX_SIZE) {
      throw new AppError('File size exceeds maximum allowed size (200MB)', 400);
    }

    // Calculate expected number of chunks
    const expectedChunks = Math.ceil(totalSize / chunkSize);
    if (totalChunks !== expectedChunks) {
      throw new AppError('Total chunks does not match calculated chunks', 400);
    }

    // Generate unique session ID and filename
    const sessionId = crypto.randomUUID();
    const uniqueFilename = generateUniqueFilename(filename);

    // Create session data
    const sessionData: UploadSessionData = {
      sessionId,
      originalName: filename,
      filename: uniqueFilename,
      totalChunks,
      totalSize,
      chunkSize,
      mimeType: mimeType || 'application/octet-stream',
      status: 'pending',
      uploadedChunks: [],
      createdAt: new Date().toISOString(),
    };

    // Save to Redis with 24-hour TTL
    await saveSession(sessionData);

    // Ensure chunks directory exists
    await ensureChunksDirectory();

    // Create session directory
    const sessionDir = getSessionDir(sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    res.status(201).json({
      success: true,
      data: {
        sessionId: sessionData.sessionId,
        filename: sessionData.filename,
        totalChunks: sessionData.totalChunks,
        chunkSize: sessionData.chunkSize,
        expiresIn: SESSION_TTL, // seconds
      },
    });
  }

  /**
   * Upload a single chunk
   * POST /api/images/chunked/upload/:sessionId
   */
  async uploadChunk(req: Request, res: Response) {
    const { sessionId } = req.params;
    const chunkNumber = parseInt(req.body.chunkNumber);

    if (isNaN(chunkNumber) || chunkNumber < 0) {
      throw new AppError('Invalid chunk number', 400);
    }

    if (!req.file) {
      throw new AppError('No chunk file uploaded', 400);
    }

    // Get session from Redis
    const session = await getSession(sessionId);

    if (!session) {
      throw new AppError('Upload session not found or expired', 404);
    }

    // Check if session is already completed
    if (session.status === 'completed') {
      throw new AppError('Upload session already completed', 400);
    }

    // Validate chunk number is within range
    if (chunkNumber >= session.totalChunks) {
      throw new AppError(`Invalid chunk number. Must be between 0 and ${session.totalChunks - 1}`, 400);
    }

    // Check if chunk already uploaded
    if (session.uploadedChunks.includes(chunkNumber)) {
      return res.json({
        success: true,
        message: 'Chunk already uploaded',
        data: {
          sessionId: session.sessionId,
          chunkNumber,
          uploadedChunks: session.uploadedChunks.length,
          totalChunks: session.totalChunks,
        },
      });
    }

    // Save chunk to disk
    const chunkPath = getChunkPath(sessionId, chunkNumber);
    await fs.writeFile(chunkPath, req.file.buffer);

    // Update session in Redis
    const updatedUploadedChunks = [...session.uploadedChunks, chunkNumber].sort((a, b) => a - b);
    await updateSession(sessionId, {
      uploadedChunks: updatedUploadedChunks,
      status: 'in_progress',
    });

    res.json({
      success: true,
      message: 'Chunk uploaded successfully',
      data: {
        sessionId: session.sessionId,
        chunkNumber,
        uploadedChunks: updatedUploadedChunks.length,
        totalChunks: session.totalChunks,
        isComplete: updatedUploadedChunks.length === session.totalChunks,
      },
    });
  }

  /**
   * Complete chunked upload and assemble file
   * POST /api/images/chunked/complete/:sessionId
   */
  async completeUpload(req: Request, res: Response) {
    const { sessionId } = req.params;

    // Get session from Redis
    const session = await getSession(sessionId);

    if (!session) {
      throw new AppError('Upload session not found or expired', 404);
    }

    // Check if all chunks uploaded
    if (session.uploadedChunks.length !== session.totalChunks) {
      throw new AppError(
        `Upload incomplete. ${session.uploadedChunks.length} of ${session.totalChunks} chunks uploaded`,
        400
      );
    }

    try {
      // Assemble chunks into final file
      const finalPath = path.join(IMAGES_DIR, session.filename);
      const writeStream = await fs.open(finalPath, 'w');

      try {
        // Write chunks in order
        for (let i = 0; i < session.totalChunks; i++) {
          const chunkPath = getChunkPath(sessionId, i);
          const chunkData = await fs.readFile(chunkPath);
          await writeStream.write(chunkData);
        }
      } finally {
        await writeStream.close();
      }

      // Verify file size
      const stats = await fs.stat(finalPath);
      if (stats.size !== session.totalSize) {
        await fs.unlink(finalPath);
        throw new AppError('File size mismatch after assembly', 500);
      }

      // Get file paths
      const { imagePath, thumbnailPath, relativeImagePath, relativeThumbnailPath } =
        getImagePaths(session.filename);

      // Process image and get metadata
      const imageMetadata = await processImage(imagePath);

      // Check for duplicates by hash
      const existingImage = await getImageByHash(imageMetadata.hash);
      if (existingImage) {
        // Clean up uploaded file
        await fs.unlink(finalPath);
        throw new AppError('Duplicate image already exists', 409);
      }

      // Generate thumbnail if image is not corrupted
      let finalThumbnailPath = null;
      if (!imageMetadata.isCorrupted) {
        try {
          await generateThumbnail(imagePath, thumbnailPath);
          finalThumbnailPath = relativeThumbnailPath;
        } catch (error) {
          logger.error('Error generating thumbnail:', error);
        }
      }

      // Extract EXIF data
      let exifData = null;
      if (!imageMetadata.isCorrupted) {
        exifData = await extractExifData(imagePath);
      }

      // Prepare image data for PostgreSQL
      const imageData = {
        filename: session.filename,
        originalName: session.originalName,
        filePath: relativeImagePath,
        thumbnailPath: finalThumbnailPath,
        fileSize: imageMetadata.size,
        format: getFileExtension(session.originalName),
        width: imageMetadata.width || null,
        height: imageMetadata.height || null,
        hash: imageMetadata.hash,
        mimeType: session.mimeType || 'application/octet-stream',
        isCorrupted: imageMetadata.isCorrupted,
      };

      // Create image record in PostgreSQL with EXIF data
      const newImage = await createImageWithExif(imageData, exifData || undefined);

      // Log successful chunked upload to sync log
      const clientId = getClientId(req);
      await logSuccessfulOperation({
        operation: 'upload',
        imageId: newImage.id,
        clientId,
        metadata: {
          original_filename: session.originalName,
          file_size: imageMetadata.size,
          file_hash: imageMetadata.hash,
          upload_type: 'chunked',
          chunks_count: session.totalChunks,
        },
      });

      // Update session status to completed in Redis
      await updateSession(sessionId, {
        status: 'completed',
      });

      // Clean up chunks directory
      const sessionDir = getSessionDir(sessionId);
      await fs.rm(sessionDir, { recursive: true, force: true });

      // Delete session from Redis after successful completion
      await deleteSession(sessionId);

      res.status(201).json({
        success: true,
        message: 'Upload completed successfully',
        data: newImage,
      });
    } catch (error: any) {
      // Mark session as failed in Redis
      try {
        await updateSession(sessionId, { status: 'failed' });
      } catch (updateError) {
        logger.error('Failed to update session status:', updateError);
      }

      throw error;
    }
  }

  /**
   * Get upload session status
   * GET /api/images/chunked/status/:sessionId
   */
  async getStatus(req: Request, res: Response) {
    const { sessionId } = req.params;

    const session = await getSession(sessionId);

    if (!session) {
      throw new AppError('Upload session not found or expired', 404);
    }

    // Get TTL from Redis
    const key = getSessionKey(sessionId);
    const ttl = await redis.ttl(key);

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        filename: session.filename,
        originalName: session.originalName,
        status: session.status,
        uploadedChunks: session.uploadedChunks.length,
        totalChunks: session.totalChunks,
        uploadedChunksList: session.uploadedChunks,
        progress: ((session.uploadedChunks.length / session.totalChunks) * 100).toFixed(2) + '%',
        expiresIn: ttl > 0 ? ttl : 0, // seconds remaining
        createdAt: session.createdAt,
      },
    });
  }

  /**
   * Cancel/delete an upload session
   * DELETE /api/images/chunked/:sessionId
   */
  async cancelUpload(req: Request, res: Response) {
    const { sessionId } = req.params;

    const session = await getSession(sessionId);

    if (!session) {
      throw new AppError('Upload session not found or expired', 404);
    }

    // Clean up chunks directory
    const sessionDir = getSessionDir(sessionId);
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
    } catch (error) {
      logger.error(`Failed to delete chunks directory:`, error);
    }

    // Delete session from Redis
    await deleteSession(sessionId);

    res.json({
      success: true,
      message: 'Upload session cancelled and cleaned up',
    });
  }

  /**
   * Initialize a chunked image replacement session
   * POST /api/images/uuid/:uuid/replace/chunked/init
   */
  async initReplaceUpload(req: Request, res: Response) {
    const { uuid } = req.params;
    const { filename, totalSize, chunkSize, totalChunks, mimeType } = req.body;

    // Check if image exists
    const existingImage = await getImageByUuid(uuid);
    if (!existingImage) {
      throw new AppError('Image not found', 404);
    }

    // Validate required fields
    if (!filename || !totalSize || !chunkSize || !totalChunks) {
      throw new AppError('Missing required fields: filename, totalSize, chunkSize, totalChunks', 400);
    }

    // Validate file type
    const ext = path.extname(filename).toLowerCase();
    const ALLOWED_FORMATS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'];
    if (!ALLOWED_FORMATS.includes(ext)) {
      throw new AppError(`Invalid file format. Allowed formats: ${ALLOWED_FORMATS.join(', ')}`, 400);
    }

    // Validate total size (max 200MB for chunked uploads)
    const MAX_SIZE = 200 * 1024 * 1024;
    if (totalSize > MAX_SIZE) {
      throw new AppError('File size exceeds maximum allowed size (200MB)', 400);
    }

    // Calculate expected number of chunks
    const expectedChunks = Math.ceil(totalSize / chunkSize);
    if (totalChunks !== expectedChunks) {
      throw new AppError('Total chunks does not match calculated chunks', 400);
    }

    // Generate unique session ID and filename
    const sessionId = crypto.randomUUID();
    const uniqueFilename = generateUniqueFilename(filename);

    // Create session data with replacement metadata
    const sessionData: UploadSessionData & { replaceUuid?: string } = {
      sessionId,
      originalName: filename,
      filename: uniqueFilename,
      totalChunks,
      totalSize,
      chunkSize,
      mimeType: mimeType || 'application/octet-stream',
      status: 'pending',
      uploadedChunks: [],
      createdAt: new Date().toISOString(),
      replaceUuid: uuid, // Store UUID for replacement
    };

    // Save to Redis with 24-hour TTL
    await saveSession(sessionData);

    // Ensure chunks directory exists
    await ensureChunksDirectory();

    // Create session directory
    const sessionDir = getSessionDir(sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    res.status(201).json({
      success: true,
      data: {
        sessionId: sessionData.sessionId,
        filename: sessionData.filename,
        totalChunks: sessionData.totalChunks,
        chunkSize: sessionData.chunkSize,
        expiresIn: SESSION_TTL,
        replaceUuid: uuid,
      },
    });
  }

  /**
   * Complete chunked image replacement and assemble file
   * POST /api/images/uuid/:uuid/replace/chunked/complete/:sessionId
   */
  async completeReplaceUpload(req: Request, res: Response) {
    const { uuid, sessionId } = req.params;

    // Get session from Redis
    const session = await getSession(sessionId) as UploadSessionData & { replaceUuid?: string };

    if (!session) {
      throw new AppError('Upload session not found or expired', 404);
    }

    // Verify session is for this UUID
    if (session.replaceUuid !== uuid) {
      throw new AppError('Session does not match image UUID', 400);
    }

    // Check if image exists
    const existingImage = await getImageByUuid(uuid);
    if (!existingImage) {
      throw new AppError('Image not found', 404);
    }

    // Check if all chunks uploaded
    if (session.uploadedChunks.length !== session.totalChunks) {
      throw new AppError(
        `Upload incomplete. ${session.uploadedChunks.length} of ${session.totalChunks} chunks uploaded`,
        400
      );
    }

    try {
      // Assemble chunks into final file
      const finalPath = path.join(IMAGES_DIR, session.filename);
      const writeStream = await fs.open(finalPath, 'w');

      try {
        // Write chunks in order
        for (let i = 0; i < session.totalChunks; i++) {
          const chunkPath = getChunkPath(sessionId, i);
          const chunkData = await fs.readFile(chunkPath);
          await writeStream.write(chunkData);
        }
      } finally {
        await writeStream.close();
      }

      // Verify file size
      const stats = await fs.stat(finalPath);
      if (stats.size !== session.totalSize) {
        await fs.unlink(finalPath);
        throw new AppError('File size mismatch after assembly', 500);
      }

      // Get file paths
      const { imagePath, thumbnailPath, relativeImagePath, relativeThumbnailPath } =
        getImagePaths(session.filename);

      // Process image and get metadata
      const imageMetadata = await processImage(imagePath);

      // Generate thumbnail if image is not corrupted
      let finalThumbnailPath = null;
      if (!imageMetadata.isCorrupted) {
        try {
          await generateThumbnail(imagePath, thumbnailPath);
          finalThumbnailPath = relativeThumbnailPath;
        } catch (error) {
          logger.error('Error generating thumbnail:', error);
        }
      }

      // Extract EXIF data
      let exifData = null;
      if (!imageMetadata.isCorrupted) {
        exifData = await extractExifData(imagePath);
      }

      // Prepare image data for replacement
      const imageData = {
        filename: session.filename,
        originalName: session.originalName,
        filePath: relativeImagePath,
        thumbnailPath: finalThumbnailPath,
        fileSize: imageMetadata.size,
        format: getFileExtension(session.originalName),
        width: imageMetadata.width || null,
        height: imageMetadata.height || null,
        hash: imageMetadata.hash,
        mimeType: session.mimeType || 'application/octet-stream',
        isCorrupted: imageMetadata.isCorrupted,
      };

      // Replace image in database
      const replacedImage = await replaceImageByUuid(uuid, imageData, exifData || undefined);

      // Delete old files (after successful database update)
      try {
        const oldImagePath = path.join(process.cwd(), 'storage', 'images', path.basename(existingImage.filePath));
        await fs.unlink(oldImagePath).catch(() => {
          logger.warn(`Could not delete old image file: ${oldImagePath}`);
        });

        if (existingImage.thumbnailPath) {
          const oldThumbnailPath = path.join(process.cwd(), 'storage', 'thumbnails', path.basename(existingImage.thumbnailPath));
          await fs.unlink(oldThumbnailPath).catch(() => {
            logger.warn(`Could not delete old thumbnail file: ${oldThumbnailPath}`);
          });
        }
      } catch (error) {
        logger.error('Error deleting old files:', error);
      }

      // Log successful chunked replacement to sync log
      const clientId = getClientId(req);
      await logSuccessfulOperation({
        operation: 'replace',
        imageId: existingImage.id,
        clientId,
        metadata: {
          old_filename: existingImage.filename,
          new_filename: session.filename,
          new_file_size: imageMetadata.size,
          new_file_hash: imageMetadata.hash,
          upload_type: 'chunked',
          chunks_count: session.totalChunks,
        },
      });

      // Update session status to completed in Redis
      await updateSession(sessionId, {
        status: 'completed',
      });

      // Clean up chunks directory
      const sessionDir = getSessionDir(sessionId);
      await fs.rm(sessionDir, { recursive: true, force: true });

      // Delete session from Redis after successful completion
      await deleteSession(sessionId);

      res.status(200).json({
        success: true,
        message: 'Image replaced successfully',
        data: replacedImage,
      });
    } catch (error: any) {
      // Mark session as failed in Redis
      try {
        await updateSession(sessionId, { status: 'failed' });
      } catch (updateError) {
        logger.error('Failed to update session status:', updateError);
      }

      throw error;
    }
  }
}

export const chunkedUploadController = new ChunkedUploadController();
