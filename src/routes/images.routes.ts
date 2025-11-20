import { Router, Request, Response } from 'express';
import { imagesController } from '../controllers/images.controller';
import { chunkedUploadController } from '../controllers/chunkedUpload.controller';
import { purgeController } from '../controllers/purge.controller';
import { collectionsController } from '../controllers/collections.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { upload } from '../middleware/upload';
import { chunkUpload } from '../middleware/chunkUpload';



const router = Router();

/**
 * @swagger
 * /api/images:
 *   get:
 *     summary: Get all images
 *     tags: [Images]
 *     parameters:
 *       - in: query
 *         name: withExif
 *         schema:
 *           type: boolean
 *         description: Include EXIF data
 *     responses:
 *       200:
 *         description: List of images
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Image'
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  if (req.query.withExif === 'true') {
    return imagesController.getAllWithExif(req, res);
  }
  return imagesController.getAll(req, res);
}));

/**
 * @swagger
 * /api/images/paginated:
 *   get:
 *     summary: Get paginated images with cursor-based pagination (infinite scroll)
 *     tags: [Images]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page (max 100)
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor for pagination (base64 encoded ID from previous response)
 *       - in: query
 *         name: collectionId
 *         schema:
 *           type: integer
 *         description: Filter images by collection ID
 *       - in: query
 *         name: withExif
 *         schema:
 *           type: boolean
 *         description: Include EXIF data
 *     responses:
 *       200:
 *         description: Paginated list of images
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Image'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     nextCursor:
 *                       type: string
 *                       nullable: true
 *                       description: Cursor for next page (null if no more data)
 *                     hasMore:
 *                       type: boolean
 *                       description: Whether there are more items to load
 *                     limit:
 *                       type: integer
 *                       description: Items per page
 *       400:
 *         description: Invalid parameters
 */
router.get('/paginated', asyncHandler(imagesController.getPaginated));

/**
 * @swagger
 * /api/images/page:
 *   get:
 *     summary: Get paginated images with page-based pagination (traditional pagination)
 *     tags: [Images]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (starts from 1)
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page (max 100)
 *       - in: query
 *         name: collectionId
 *         schema:
 *           type: integer
 *         description: Filter images by collection ID
 *       - in: query
 *         name: withExif
 *         schema:
 *           type: boolean
 *         description: Include EXIF data
 *     responses:
 *       200:
 *         description: Paginated list of images
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                   description: Number of items in current page
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Image'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       description: Current page number
 *                     pageSize:
 *                       type: integer
 *                       description: Items per page
 *                     totalItems:
 *                       type: integer
 *                       description: Total number of items
 *                     totalPages:
 *                       type: integer
 *                       description: Total number of pages
 *                     hasNext:
 *                       type: boolean
 *                       description: Whether there is a next page
 *                     hasPrev:
 *                       type: boolean
 *                       description: Whether there is a previous page
 *       400:
 *         description: Invalid parameters
 */
router.get('/page', asyncHandler(imagesController.getPagePaginated));

/**
 * @swagger
 * /api/images/stats:
 *   get:
 *     summary: Get image statistics
 *     tags: [Images]
 *     responses:
 *       200:
 *         description: Image statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ImageStats'
 */
router.get('/stats', asyncHandler(imagesController.getStats));

/**
 * @swagger
 * /api/images/{id}:
 *   get:
 *     summary: Get image by ID
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Image ID
 *     responses:
 *       200:
 *         description: Image details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Image'
 *       404:
 *         description: Image not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', asyncHandler(imagesController.getById));

/**
 * @swagger
 * /api/images/uuid/{uuid}:
 *   get:
 *     summary: Get image by UUID
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Image UUID
 *     responses:
 *       200:
 *         description: Image details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Image'
 *       404:
 *         description: Image not found
 */
router.get('/uuid/:uuid', asyncHandler(imagesController.getByUuid));

/**
 * @swagger
 * /api/images/{id}:
 *   put:
 *     summary: Update image metadata
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filename:
 *                 type: string
 *               originalName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Image updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Image'
 */
router.put('/:id', asyncHandler(imagesController.update));

/**
 * @swagger
 * /api/images/{id}:
 *   delete:
 *     summary: Delete image (soft delete)
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Image deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.delete('/:id', asyncHandler(imagesController.delete));

/**
 * @swagger
 * /api/images/upload:
 *   post:
 *     summary: Upload images
 *     tags: [Images]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Images uploaded successfully
 *       400:
 *         description: No files uploaded or invalid format
 */
router.post('/upload', upload.array('images', 30), asyncHandler(imagesController.upload));

/**
 * @swagger
 * /api/images/batch:
 *   post:
 *     summary: Batch upload from folder config
 *     tags: [Images]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Batch upload completed
 *       501:
 *         description: Not yet implemented
 */
router.post('/batch', asyncHandler(imagesController.batchUpload));

/**
 * @swagger
 * /api/images/chunked/init:
 *   post:
 *     summary: Initialize a chunked upload session
 *     tags: [Chunked Upload]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - filename
 *               - totalSize
 *               - chunkSize
 *               - totalChunks
 *             properties:
 *               filename:
 *                 type: string
 *                 description: Original filename
 *                 example: large-image.jpg
 *               totalSize:
 *                 type: integer
 *                 description: Total file size in bytes
 *                 example: 52428800
 *               chunkSize:
 *                 type: integer
 *                 description: Size of each chunk in bytes
 *                 example: 5242880
 *               totalChunks:
 *                 type: integer
 *                 description: Total number of chunks
 *                 example: 10
 *               mimeType:
 *                 type: string
 *                 description: MIME type of the file
 *                 example: image/jpeg
 *     responses:
 *       201:
 *         description: Upload session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                       format: uuid
 *                     filename:
 *                       type: string
 *                     totalChunks:
 *                       type: integer
 *                     chunkSize:
 *                       type: integer
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid request
 */
router.post('/chunked/init', asyncHandler(chunkedUploadController.initUpload));

/**
 * @swagger
 * /api/images/chunked/upload/{sessionId}:
 *   post:
 *     summary: Upload a single chunk
 *     tags: [Chunked Upload]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Upload session ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - chunk
 *               - chunkNumber
 *             properties:
 *               chunk:
 *                 type: string
 *                 format: binary
 *                 description: Chunk data
 *               chunkNumber:
 *                 type: integer
 *                 description: Zero-based chunk index
 *     responses:
 *       200:
 *         description: Chunk uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                     chunkNumber:
 *                       type: integer
 *                     uploadedChunks:
 *                       type: integer
 *                     totalChunks:
 *                       type: integer
 *                     isComplete:
 *                       type: boolean
 *       400:
 *         description: Invalid chunk or session
 *       404:
 *         description: Session not found
 *       410:
 *         description: Session expired
 */
router.post('/chunked/upload/:sessionId', chunkUpload.single('chunk'), asyncHandler(chunkedUploadController.uploadChunk));

/**
 * @swagger
 * /api/images/chunked/complete/{sessionId}:
 *   post:
 *     summary: Complete chunked upload and assemble file
 *     tags: [Chunked Upload]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Upload session ID
 *     responses:
 *       201:
 *         description: Upload completed and image created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Image'
 *       400:
 *         description: Upload incomplete
 *       404:
 *         description: Session not found
 *       409:
 *         description: Duplicate image
 *       410:
 *         description: Session expired
 */
router.post('/chunked/complete/:sessionId', asyncHandler(chunkedUploadController.completeUpload));

/**
 * @swagger
 * /api/images/chunked/status/{sessionId}:
 *   get:
 *     summary: Get upload session status
 *     tags: [Chunked Upload]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Upload session ID
 *     responses:
 *       200:
 *         description: Session status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                     filename:
 *                       type: string
 *                     originalName:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, in_progress, completed, failed, expired]
 *                     uploadedChunks:
 *                       type: integer
 *                     totalChunks:
 *                       type: integer
 *                     uploadedChunksList:
 *                       type: array
 *                       items:
 *                         type: integer
 *                     progress:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Session not found
 */
router.get('/chunked/status/:sessionId', asyncHandler(chunkedUploadController.getStatus));

/**
 * @swagger
 * /api/images/chunked/{sessionId}:
 *   delete:
 *     summary: Cancel and cleanup upload session
 *     tags: [Chunked Upload]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Upload session ID
 *     responses:
 *       200:
 *         description: Session cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Session not found
 */
router.delete('/chunked/:sessionId', asyncHandler(chunkedUploadController.cancelUpload));

/**
 * @swagger
 * /api/images/dev/purge:
 *   delete:
 *     summary: Purge all data (files + database + Redis) - DEV ONLY
 *     tags: [Development]
 *     description: WARNING - Deletes ALL images, thumbnails, chunks, database records, and Redis sessions. Only available in development mode.
 *     responses:
 *       200:
 *         description: Data purged successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         deletedFiles:
 *                           type: integer
 *                         deletedThumbnails:
 *                           type: integer
 *                         deletedChunkDirectories:
 *                           type: integer
 *                         deletedDatabaseRecords:
 *                           type: integer
 *                         deletedRedisSessions:
 *                           type: integer
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *       403:
 *         description: Forbidden in production mode
 */
router.delete('/dev/purge', asyncHandler(purgeController.purgeAll));

/**
 * @swagger
 * /api/images/dev/purge/files:
 *   delete:
 *     summary: Purge only files (keep database) - DEV ONLY
 *     tags: [Development]
 *     description: Deletes images, thumbnails, and chunks. Preserves database records.
 *     responses:
 *       200:
 *         description: Files purged successfully
 *       403:
 *         description: Forbidden in production mode
 */
router.delete('/dev/purge/files', asyncHandler(purgeController.purgeFiles));

/**
 * @swagger
 * /api/images/dev/purge/database:
 *   delete:
 *     summary: Purge only database records (keep files) - DEV ONLY
 *     tags: [Development]
 *     description: Deletes all database records. Preserves files on disk.
 *     responses:
 *       200:
 *         description: Database purged successfully
 *       403:
 *         description: Forbidden in production mode
 */
router.delete('/dev/purge/database', asyncHandler(purgeController.purgeDatabase));

/**
 * @swagger
 * /api/images/dev/purge/redis:
 *   delete:
 *     summary: Purge only Redis sessions - DEV ONLY
 *     tags: [Development]
 *     description: Deletes all upload sessions from Redis.
 *     responses:
 *       200:
 *         description: Redis sessions purged successfully
 *       403:
 *         description: Forbidden in production mode
 */
router.delete('/dev/purge/redis', asyncHandler(purgeController.purgeRedis));

/**
 * @swagger
 * /api/images/dev/purge/chunks:
 *   delete:
 *     summary: Purge only chunk directories - DEV ONLY
 *     tags: [Development]
 *     description: Deletes temporary chunk upload directories.
 *     responses:
 *       200:
 *         description: Chunks purged successfully
 *       403:
 *         description: Forbidden in production mode
 */
router.delete('/dev/purge/chunks', asyncHandler(purgeController.purgeChunks));

/**
 * @swagger
 * /api/images/{imageId}/collections:
 *   get:
 *     summary: Get collections containing a specific image
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Image ID
 *     responses:
 *       200:
 *         description: List of collections containing the image
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Collection'
 *       404:
 *         description: Image not found
 */
router.get('/:imageId/collections', asyncHandler(collectionsController.getCollectionsForImage));

export default router;
