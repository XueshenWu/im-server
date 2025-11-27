import { Request, Response } from 'express';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { images } from '../db/schema';
import minioClient from '../config/minio';
import { redisClient } from '../config/redis';




export class WebhookController {

async handleMinio(req: Request, res: Response) {
    const event = req.body;
    if (!event.Records) return res.status(200).send();

    for (const record of event.Records) {
      const key = decodeURIComponent(record.s3.object.key);
      // Remove extension and "-thumb" suffix to get the raw UUID
      // Example: "abc-123.jpg" -> "abc-123"
      // Example: "abc-123-thumb.jpg" -> "abc-123"
      const uuid = path.parse(key).name.replace('-thumb', ''); 

      // 1. Atomic Increment in Redis
      const redisKey = `upload_progress:${uuid}`;
      const count = await redisClient.incr(redisKey);
      
      // 2. Set expiry (clean up garbage after 10 mins)
      if (count === 1) await redisClient.expire(redisKey, 600);

      console.log(`[Webhook] Event for ${uuid}. Count: ${count}/2`);

      // 3. Check Condition
      if (count === 2) {
        // Both files have arrived!
        await db.update(images)
          .set({ status: 'processed', updatedAt: new Date() })
          .where(eq(images.uuid, uuid));
          
        // Cleanup Redis immediately
        await redisClient.del(redisKey);
        console.log(`[Webhook] ✅ Process complete for ${uuid}`);
      }
    }
    res.status(200).send();
  }
}


export const webhookController =new WebhookController();