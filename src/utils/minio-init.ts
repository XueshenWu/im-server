import * as Minio from 'minio'; // <--- Import the library class
import minioClient from '../config/minio'; // Import your configured instance

const BUCKET_IMAGES = process.env.MINIO_BUCKET_IMAGES || 'images';
const BUCKET_THUMBNAILS = process.env.MINIO_BUCKET_THUMBNAILS || 'thumbnails';

const publicReadPolicy = (bucketName: string) => JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Principal: { AWS: ['*'] },
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${bucketName}/*`],
    },
  ],
});

export const initMinio = async () => {
  console.log('[MinIO] Initializing buckets and policies...');

  try {
    // 1. Create Buckets (Idempotent)
    const imagesExists = await minioClient.bucketExists(BUCKET_IMAGES);
    if (!imagesExists) {
      await minioClient.makeBucket(BUCKET_IMAGES, 'us-east-1');
      console.log(`[MinIO] Bucket '${BUCKET_IMAGES}' created.`);
    }

    const thumbExists = await minioClient.bucketExists(BUCKET_THUMBNAILS);
    if (!thumbExists) {
      await minioClient.makeBucket(BUCKET_THUMBNAILS, 'us-east-1');
      console.log(`[MinIO] Bucket '${BUCKET_THUMBNAILS}' created.`);
    }

    // 2. Set Policy
    await minioClient.setBucketPolicy(BUCKET_THUMBNAILS, publicReadPolicy(BUCKET_THUMBNAILS));
    console.log(`[MinIO] Public policy set for '${BUCKET_THUMBNAILS}'.`);

    // 3. Configure Webhook Notification
    // FIX: Use 'Minio.NotificationConfig' (Static), not 'minioClient.NotificationConfig'
    const webhookArn = 'arn:minio:sqs::primary:webhook';
    
    const notificationConfig = new Minio.NotificationConfig();
    const queueConfig = new Minio.QueueConfig(webhookArn);
    
    // FIX: Use 'Minio.ObjectCreatedAll'
    queueConfig.addEvent(Minio.ObjectCreatedAll);
    
    notificationConfig.add(queueConfig);

    await minioClient.setBucketNotification(BUCKET_IMAGES, notificationConfig);
    console.log(`[MinIO] Bucket '${BUCKET_IMAGES}' subscribed to webhook.`);

  } catch (error) {
    console.error('[MinIO] Init Error:', error);
  }
};