import { Router, Request, Response } from 'express';
import { imagesController } from '../controllers/images.controller';
import { chunkedUploadController } from '../controllers/chunkedUpload.controller';
import { purgeController } from '../controllers/purge.controller';
import { collectionsController } from '../controllers/collections.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { upload } from '../middleware/upload';
import { chunkUpload } from '../middleware/chunkUpload';
import { validateSync } from '../middleware/syncValidation';



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
 * /api/images/file/{id}:
 *   get:
 *     summary: Get image file by ID with optional metadata
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Image ID
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
 *           X-Image-Original-Name:
 *             schema:
 *               type: string
 *             description: Original filename (when info=true)
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
 */
router.get('/file/:id', asyncHandler(imagesController.getFileById));

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
 *           X-Image-Original-Name:
 *             schema:
 *               type: string
 *             description: Original filename (when info=true)
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
 */
router.get('/file/uuid/:uuid', asyncHandler(imagesController.getFileByUuid));

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
router.get('/:id', validateSync, asyncHandler(imagesController.getById));

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
router.get('/uuid/:uuid', validateSync, asyncHandler(imagesController.getByUuid));

/**
 * @swagger
 * /api/images/uuid/{uuid}/replace:
 *   put:
 *     summary: Replace image file by UUID
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Image UUID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image replaced successfully
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
 *       404:
 *         description: Image not found
 */
router.put('/uuid/:uuid/replace', validateSync, upload.single('image'), asyncHandler(imagesController.replaceImage));

/**
 * @swagger
 * /api/images/uuid/{uuid}/replace/chunked/init:
 *   post:
 *     summary: Initialize chunked image replacement session
 *     tags: [Image Replacement]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Image UUID to replace
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
 *               totalSize:
 *                 type: integer
 *                 description: Total file size in bytes
 *               chunkSize:
 *                 type: integer
 *                 description: Size of each chunk in bytes
 *               totalChunks:
 *                 type: integer
 *                 description: Total number of chunks
 *               mimeType:
 *                 type: string
 *                 description: MIME type of the file
 *     responses:
 *       201:
 *         description: Replacement session created
 *       404:
 *         description: Image not found
 */
router.post('/uuid/:uuid/replace/chunked/init', validateSync, asyncHandler(chunkedUploadController.initReplaceUpload));

/**
 * @swagger
 * /api/images/uuid/{uuid}/replace/chunked/upload/{sessionId}:
 *   post:
 *     summary: Upload chunk for image replacement
 *     tags: [Image Replacement]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *               chunkNumber:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Chunk uploaded successfully
 */
router.post('/uuid/:uuid/replace/chunked/upload/:sessionId', chunkUpload.single('chunk'), asyncHandler(chunkedUploadController.uploadChunk));

/**
 * @swagger
 * /api/images/uuid/{uuid}/replace/chunked/complete/{sessionId}:
 *   post:
 *     summary: Complete chunked image replacement
 *     tags: [Image Replacement]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Image replaced successfully
 *       404:
 *         description: Image or session not found
 */
router.post('/uuid/:uuid/replace/chunked/complete/:sessionId', validateSync, asyncHandler(chunkedUploadController.completeReplaceUpload));

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
router.put('/:id', validateSync, asyncHandler(imagesController.update));

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
router.delete('/:id', validateSync, asyncHandler(imagesController.delete));

/**
 * @swagger
 * /api/images/batch/delete/ids:
 *   post:
 *     summary: Batch soft delete images by IDs
 *     tags: [Images]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of image IDs to soft delete
 *                 example: [1, 2, 3, 4, 5]
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
 *                       type: object
 *                       properties:
 *                         requested:
 *                           type: integer
 *                           description: Number of IDs requested
 *                         successful:
 *                           type: integer
 *                           description: Number of images successfully deleted
 *                         failed:
 *                           type: integer
 *                           description: Number of images that failed to delete
 *       400:
 *         description: Invalid request body
 */
router.post('/batch/delete/ids', validateSync, asyncHandler(imagesController.batchDeleteByIds));

/**
 * @swagger
 * /api/images/batch/update:
 *   put:
 *     summary: Batch update image metadata by UUIDs
 *     tags: [Images]
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
 *                   properties:
 *                     uuid:
 *                       type: string
 *                       format: uuid
 *                     filename:
 *                       type: string
 *                     originalName:
 *                       type: string
 *                 description: Array of image updates with UUID and fields to update
 *                 example:
 *                   - uuid: "867130af-dbc1-40cd-99f2-fb75baf9b8e1"
 *                     filename: "new-name.jpg"
 *                   - uuid: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 *                     originalName: "updated.png"
 *     responses:
 *       200:
 *         description: Images updated successfully
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
 *                       type: object
 *                       properties:
 *                         requested:
 *                           type: integer
 *                         successful:
 *                           type: integer
 *                         failed:
 *                           type: integer
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           uuid:
 *                             type: string
 *                           error:
 *                             type: string
 *       400:
 *         description: Invalid request body
 */
router.put('/batch/update', validateSync, asyncHandler(imagesController.batchUpdate));

/**
 * @swagger
 * /api/images/batch/delete/uuids:
 *   post:
 *     summary: Batch soft delete images by UUIDs
 *     tags: [Images]
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
 *                 description: Array of image UUIDs to soft delete
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
 *                       type: object
 *                       properties:
 *                         requested:
 *                           type: integer
 *                           description: Number of UUIDs requested
 *                         successful:
 *                           type: integer
 *                           description: Number of images successfully deleted
 *                         failed:
 *                           type: integer
 *                           description: Number of images that failed to delete
 *       400:
 *         description: Invalid request body
 */
router.post('/batch/delete/uuids', validateSync, asyncHandler(imagesController.batchDeleteByUuids));

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
 */
router.post('/batch/get/uuids',  asyncHandler(imagesController.getImagesByUUID));

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
router.post('/upload', validateSync, upload.array('images', 30), asyncHandler(imagesController.upload));

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
router.post('/chunked/init', validateSync, asyncHandler(chunkedUploadController.initUpload));

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
router.post('/chunked/complete/:sessionId', validateSync, asyncHandler(chunkedUploadController.completeUpload));

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
router.get('/chunked/status/:sessionId', validateSync, asyncHandler(chunkedUploadController.getStatus));

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
