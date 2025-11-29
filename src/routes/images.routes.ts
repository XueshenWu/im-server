import { Router, Request, Response } from 'express';
import { imagesController } from '../controllers/images.controller';
import { purgeController } from '../controllers/purge.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { validateSync, validateLwwLock } from '../middleware/syncValidation';



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
 *       400:
 *         description: Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, size, type, updatedAt]
 *         description: Field to sort by (name=originalName, size=fileSize, type=format, updatedAt=updatedAt)
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending)
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/paginated', validateSync, asyncHandler(imagesController.getPaginated));

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
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, size, type, updatedAt]
 *         description: Field to sort by (name=originalName, size=fileSize, type=format, updatedAt=updatedAt)
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending)
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/page', validateSync, asyncHandler(imagesController.getPagePaginated));

/**
 * @swagger
 * /api/images/metadata:
 *   get:
 *     summary: Get minimal metadata for all images (for efficient sync state comparison)
 *     tags: [Images]
 *     parameters:
 *       - in: query
 *         name: since
 *         schema:
 *           type: integer
 *         description: Only return metadata for images modified since this sync sequence
 *     responses:
 *       200:
 *         description: List of image metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 currentSequence:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       uuid:
 *                         type: string
 *                       hash:
 *                         type: string
 *                       updatedAt:
 *                         type: string
 *                       fileSize:
 *                         type: integer
 *       400:
 *         description: Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/metadata', validateSync, asyncHandler(imagesController.getMetadata));

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
router.get('/stats', validateSync, asyncHandler(imagesController.getStats));

/**
 * @swagger
 * /api/images/summary:
 *   get:
 *     summary: Get daily upload/delete summary for specified time window
 *     tags: [Images]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 14
 *           default: 7
 *         description: Number of days to retrieve summary for (from today-days to today, max 14)
 *     responses:
 *       200:
 *         description: Daily summary of image uploads and deletes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                         example: "2025-11-29"
 *                       uploaded:
 *                         type: integer
 *                         example: 15
 *                       deleted:
 *                         type: integer
 *                         example: 3
 *       400:
 *         description: Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/summary', validateSync, asyncHandler(imagesController.getSummary));

/**
 * @swagger
 * /api/images/format-stats:
 *   get:
 *     summary: Get image count statistics grouped by format
 *     tags: [Images]
 *     responses:
 *       200:
 *         description: Format statistics for all images
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       format:
 *                         type: string
 *                         example: "jpg"
 *                       count:
 *                         type: integer
 *                         example: 42
 */
router.get('/format-stats', validateSync, asyncHandler(imagesController.getFormatStats));



/**
 * @swagger
 * /api/images/file/uuid/{uuid}:
 *   get:
 *     summary: Get image file by UUID with optional metadata
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Image UUID
 *       - in: query
 *         name: info
 *         schema:
 *           type: boolean
 *         description: Include image metadata in response headers (X-Image-*)
 *     responses:
 *       200:
 *         description: Image file
 *         headers:
 *           X-Image-Id:
 *             schema:
 *               type: integer
 *             description: Image ID (when info=true)
 *           X-Image-UUID:
 *             schema:
 *               type: string
 *             description: Image UUID (when info=true)
 *           X-Image-Filename:
 *             schema:
 *               type: string
 *             description: Image filename (when info=true)
 *           X-Image-Format:
 *             schema:
 *               type: string
 *             description: Image format (when info=true)
 *           X-Image-File-Size:
 *             schema:
 *               type: integer
 *             description: File size in bytes (when info=true)
 *           X-Image-Width:
 *             schema:
 *               type: integer
 *             description: Image width (when info=true)
 *           X-Image-Height:
 *             schema:
 *               type: integer
 *             description: Image height (when info=true)
 *           X-Image-Hash:
 *             schema:
 *               type: string
 *             description: SHA-256 hash (when info=true)
 *           X-Image-Created-At:
 *             schema:
 *               type: string
 *             description: Creation timestamp (when info=true)
 *           X-Image-Updated-At:
 *             schema:
 *               type: string
 *             description: Update timestamp (when info=true)
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Image not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/file/uuid/:uuid', asyncHandler(imagesController.getFileByUuid));

router.get('/exif/uuid/:uuid', asyncHandler(imagesController.getExifByUUID));

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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/uuid/:uuid', validateSync, asyncHandler(imagesController.getByUuid));

/**
 * @swagger
 * /api/images/replace:
 *   patch:
 *     summary: Replace images (single or batch) - Update metadata and get presigned URLs
 *     tags: [Images]
 *     description: Unified endpoint for replacing images. If array length is 1, treats as single operation. If > 1, creates batch operation log.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - replacements
 *             properties:
 *               replacements:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - uuid
 *                     - filename
 *                     - format
 *                     - mimeType
 *                   properties:
 *                     uuid:
 *                       type: string
 *                       format: uuid
 *                       description: Image UUID
 *                     filename:
 *                       type: string
 *                       description: New filename
 *                     format:
 *                       type: string
 *                       description: File format (jpg, png, etc.)
 *                     mimeType:
 *                       type: string
 *                       description: MIME type (image/jpeg, image/png, etc.)
 *                     width:
 *                       type: integer
 *                       description: Image width
 *                     height:
 *                       type: integer
 *                       description: Image height
 *                     fileSize:
 *                       type: integer
 *                       description: File size in bytes
 *                     hash:
 *                       type: string
 *                       description: SHA-256 hash
 *                     exifData:
 *                       $ref: '#/components/schemas/ExifData'
 *                 description: Array of image replacements. Length 1 = single op, > 1 = batch op
 *                 example:
 *                   - uuid: "867130af-dbc1-40cd-99f2-fb75baf9b8e1"
 *                     filename: "new-image.jpg"
 *                     format: "jpg"
 *                     mimeType: "image/jpeg"
 *                     width: 1920
 *                     height: 1080
 *                     fileSize: 524288
 *                     hash: "abc123..."
 *                     exifData:
 *                       latitude: 37.7749
 *                       longitude: -122.4194
 *     responses:
 *       200:
 *         description: Images replaced successfully
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
 *                     replaced:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ReplaceResult'
 *                     stats:
 *                       $ref: '#/components/schemas/OperationStats'
 *                     errors:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/OperationError'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/replace', validateSync, validateLwwLock, asyncHandler(imagesController.replaceImages));







/**
 * @swagger
 * /api/images/update/exif:
 *   patch:
 *     summary: Update EXIF data (single or batch) - Unified endpoint
 *     tags: [Images]
 *     description: Unified endpoint for updating EXIF data. If array length is 1, treats as single operation. If > 1, creates batch operation log.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - uuid
 *                     - exifData
 *                   properties:
 *                     uuid:
 *                       type: string
 *                       format: uuid
 *                       description: Image UUID
 *                     exifData:
 *                       $ref: '#/components/schemas/ExifData'
 *                 description: Array of EXIF updates. Length 1 = single op, > 1 = batch op
 *                 example:
 *                   - uuid: "867130af-dbc1-40cd-99f2-fb75baf9b8e1"
 *                     exifData:
 *                       latitude: 37.7749
 *                       longitude: -122.4194
 *                       cameraMake: "Canon"
 *                   - uuid: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 *                     exifData:
 *                       latitude: 40.7128
 *                       longitude: -74.0060
 *     responses:
 *       200:
 *         description: EXIF data updated successfully
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
 *                     updated:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Image'
 *                     stats:
 *                       $ref: '#/components/schemas/OperationStats'
 *                     errors:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/OperationError'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/update/exif', validateSync, validateLwwLock, asyncHandler(imagesController.UpdateExifData));

/**
 * @swagger
 * /api/images/delete:
 *   delete:
 *     summary: Delete images (single or batch) - Unified endpoint
 *     tags: [Images]
 *     description: Unified endpoint for deleting images. If array length is 1, treats as single operation. If > 1, creates batch operation log.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uuids
 *             properties:
 *               uuids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of image UUIDs to soft delete. Length 1 = single op, > 1 = batch op
 *                 example: ["867130af-dbc1-40cd-99f2-fb75baf9b8e1", "f47ac10b-58cc-4372-a567-0e02b2c3d479"]
 *     responses:
 *       200:
 *         description: Images soft deleted successfully
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
 *                     deleted:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Image'
 *                     stats:
 *                       $ref: '#/components/schemas/OperationStats'
 *                     errors:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/OperationError'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/delete', validateSync, asyncHandler(imagesController.batchDeleteByUuids));

/**
 * @swagger
 * /api/images/batch/get/uuids:
 *   post:
 *     summary: Get multiple images by UUIDs
 *     tags: [Images]
 *     parameters:
 *       - in: query
 *         name: withExif
 *         schema:
 *           type: boolean
 *         description: Include EXIF data
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uuids
 *             properties:
 *               uuids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of image UUIDs to retrieve
 *                 example: ["867130af-dbc1-40cd-99f2-fb75baf9b8e1", "f47ac10b-58cc-4372-a567-0e02b2c3d479"]
 *     responses:
 *       200:
 *         description: Images retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                   description: Number of images found
 *                 requested:
 *                   type: integer
 *                   description: Number of UUIDs requested
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Image'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/batch/get/uuids', asyncHandler(imagesController.getImagesByUUID));




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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/dev/purge', asyncHandler(purgeController.purgeAll));




/**
 * @swagger
 * /api/images/requestDownloadUrls:
 *   post:
 *     summary: Request download URLs with metadata and EXIF data
 *     tags: [Images]
 *     description: Get presigned download URLs along with image metadata and EXIF data for multiple images
 *     parameters:
 *       - in: query
 *         name: expiry
 *         schema:
 *           type: integer
 *           default: 3600
 *         description: URL expiry time in seconds (default 1 hour)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uuids
 *             properties:
 *               uuids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of image UUIDs to get download URLs for
 *                 example: ["867130af-dbc1-40cd-99f2-fb75baf9b8e1", "f47ac10b-58cc-4372-a567-0e02b2c3d479"]
 *     responses:
 *       200:
 *         description: Download URLs generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                   description: Number of successful downloads
 *                 data:
 *                   type: object
 *                   properties:
 *                     downloads:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/DownloadInfo'
 *                     stats:
 *                       $ref: '#/components/schemas/OperationStats'
 *                     errors:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/OperationError'
 *       400:
 *         description: Invalid request body or parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/requestDownloadUrls', validateSync, asyncHandler(imagesController.requestDownloadUrls));

/**
 * @swagger
 * /api/images/presignUrls:
 *   post:
 *     summary: Generate presigned URLs for direct client-side image uploads
 *     tags: [Images]
 *     description: Insert pending images and generate presigned URLs for uploading image and thumbnail files
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - images
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - uuid
 *                     - mimeType
 *                   properties:
 *                     uuid:
 *                       type: string
 *                       format: uuid
 *                     mimeType:
 *                       type: string
 *                       example: image/jpeg
 *                     exifData:
 *                       $ref: '#/components/schemas/ExifData'
 *                 description: Array of image metadata to create presigned upload URLs
 *     responses:
 *       200:
 *         description: Successfully generated presigned URLs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UploadUrls'
 *       400:
 *         description: Invalid request body or parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/presignUrls', validateSync, validateLwwLock, asyncHandler(imagesController.presignURLs))

export default router;
