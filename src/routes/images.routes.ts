import { Router } from 'express';
import { imagesController } from '../controllers/images.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { upload } from '../middleware/upload';

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
router.get('/', asyncHandler(async (req, res) => {
  if (req.query.withExif === 'true') {
    return imagesController.getAllWithExif(req, res);
  }
  return imagesController.getAll(req, res);
}));

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
router.post('/upload', upload.array('images', 10), asyncHandler(imagesController.upload));

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

export default router;
