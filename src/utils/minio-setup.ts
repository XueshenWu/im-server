import * as Minio from 'minio';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

console.log('--- MinIO Setup Debugger ---');
console.log(`Endpoint: ${process.env.MINIO_ENDPOINT}`);
console.log(`Port:     ${process.env.MINIO_PORT}`);
console.log(`Access:   ${process.env.MINIO_ACCESS_KEY}`);

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
  secretKey: process.env.MINIO_SECRET_KEY || 'password',
});

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

export async function setupMinio() {
  try {
    // 1. Test Connection
    console.log('\n1. Testing Connection...');
    const buckets = await minioClient.listBuckets();
    console.log('✅ Connected! Existing buckets:', buckets.map(b => b.name));

    // 2. Create Thumbnails Bucket
    console.log(`\n2. Checking '${BUCKET_THUMBNAILS}'...`);
    const thumbExists = await minioClient.bucketExists(BUCKET_THUMBNAILS);
    if (!thumbExists) {
      await minioClient.makeBucket(BUCKET_THUMBNAILS, 'us-east-1');
      console.log(`✅ Created bucket: ${BUCKET_THUMBNAILS}`);
    } else {
      console.log(`ℹ️  Bucket '${BUCKET_THUMBNAILS}' already exists.`);
    }

    // 3. Set Policy
    console.log(`\n3. Setting Policy for '${BUCKET_THUMBNAILS}'...`);
    await minioClient.setBucketPolicy(BUCKET_THUMBNAILS, publicReadPolicy(BUCKET_THUMBNAILS));
    console.log('✅ Policy set.');

    // 4. Setup Webhook (Subscription)
    console.log(`\n4. Subscribing '${BUCKET_IMAGES}' and '${BUCKET_THUMBNAILS}' to webhook...`);
    
    // Ensure Images bucket exists first
    if (!(await minioClient.bucketExists(BUCKET_IMAGES))) {
       await minioClient.makeBucket(BUCKET_IMAGES, 'us-east-1');
       console.log(`✅ Created bucket: ${BUCKET_IMAGES}`);
    }

    if (!(await minioClient.bucketExists(BUCKET_THUMBNAILS))) {
        await minioClient.makeBucket(BUCKET_THUMBNAILS, 'us-east-1');
        console.log(`✅ Created bucket: ${BUCKET_THUMBNAILS}`);
    }

    // Prepare Config
    const webhookArn = 'arn:minio:sqs::primary:webhook';
    const config = new Minio.NotificationConfig();
    const queue = new Minio.QueueConfig(webhookArn);
    queue.addEvent(Minio.ObjectCreatedAll);
    config.add(queue);

    await minioClient.setBucketNotification(BUCKET_IMAGES, config);
    await minioClient.setBucketNotification(BUCKET_THUMBNAILS, config);
    console.log('✅ Subscription active.');

  } catch (error: any) {
    console.error('\n❌ ERROR OCCURRED:');
    if (error.code === 'ECONNREFUSED') {
      console.error('   Connection Refused! Check if MinIO is running and port 9000 is exposed.');
    } else if (error.code === 'AccessDenied') {
      console.error('   Access Denied! Check MINIO_ACCESS_KEY and MINIO_SECRET_KEY.');
    } else {
      console.error('   ', error);
    }
  }
}

