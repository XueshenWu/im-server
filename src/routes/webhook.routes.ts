import { Router } from "express";
import { webhookController } from "../controllers/webhook.controller";


const router = Router();




/**
 * @swagger
 * /webhook/minio:
 *   post:
 *     summary: Handle MinIO webhook events
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: MinIO event notification payload
 *     responses:
 *       200:
 *         description: Webhook event processed successfully
 *       500:
 *         description: Internal server error, MinIO should retry
 */
router.post('/minio', webhookController.handleMinio);

export default router;