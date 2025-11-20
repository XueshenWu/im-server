import { Router } from 'express';
import { collectionsController } from '../controllers/collections.controller';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @swagger
 * /api/collections:
 *   get:
 *     summary: Get all collections
 *     tags: [Collections]
 *     responses:
 *       200:
 *         description: List of collections with image counts
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
 */
router.get('/', asyncHandler(collectionsController.getAll));

/**
 * @swagger
 * /api/collections/{id}:
 *   get:
 *     summary: Get collection by ID
 *     tags: [Collections]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Collection ID
 *     responses:
 *       200:
 *         description: Collection details
 *       404:
 *         description: Collection not found
 */
router.get('/:id', asyncHandler(collectionsController.getById));

/**
 * @swagger
 * /api/collections/uuid/{uuid}:
 *   get:
 *     summary: Get collection by UUID
 *     tags: [Collections]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Collection UUID
 *     responses:
 *       200:
 *         description: Collection details
 *       404:
 *         description: Collection not found
 */
router.get('/uuid/:uuid', asyncHandler(collectionsController.getByUuid));

/**
 * @swagger
 * /api/collections:
 *   post:
 *     summary: Create a new collection
 *     tags: [Collections]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Vacation Photos
 *               description:
 *                 type: string
 *                 example: Photos from summer vacation 2024
 *               coverImageId:
 *                 type: integer
 *                 example: 42
 *     responses:
 *       201:
 *         description: Collection created successfully
 *       400:
 *         description: Invalid request
 */
router.post('/', asyncHandler(collectionsController.create));

/**
 * @swagger
 * /api/collections/{id}:
 *   put:
 *     summary: Update collection
 *     tags: [Collections]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Collection ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               coverImageId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Collection updated successfully
 *       404:
 *         description: Collection not found
 */
router.put('/:id', asyncHandler(collectionsController.update));

/**
 * @swagger
 * /api/collections/{id}:
 *   delete:
 *     summary: Delete collection (soft delete)
 *     tags: [Collections]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Collection ID
 *     responses:
 *       200:
 *         description: Collection deleted successfully
 *       404:
 *         description: Collection not found
 */
router.delete('/:id', asyncHandler(collectionsController.delete));

/**
 * @swagger
 * /api/collections/{id}/images:
 *   get:
 *     summary: Get images in collection
 *     tags: [Collections]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Collection ID
 *     responses:
 *       200:
 *         description: List of images in collection
 *       404:
 *         description: Collection not found
 */
router.get('/:id/images', asyncHandler(collectionsController.getImages));

/**
 * @swagger
 * /api/collections/{id}/images:
 *   post:
 *     summary: Add image to collection
 *     tags: [Collections]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Collection ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - imageId
 *             properties:
 *               imageId:
 *                 type: integer
 *                 example: 123
 *     responses:
 *       201:
 *         description: Image added to collection
 *       404:
 *         description: Collection or image not found
 */
router.post('/:id/images', asyncHandler(collectionsController.addImage));

/**
 * @swagger
 * /api/collections/{id}/images/{imageId}:
 *   delete:
 *     summary: Remove image from collection
 *     tags: [Collections]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Collection ID
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Image ID
 *     responses:
 *       200:
 *         description: Image removed from collection
 *       404:
 *         description: Image not found in collection
 */
router.delete('/:id/images/:imageId', asyncHandler(collectionsController.removeImage));

export default router;
