import * as Minio from 'minio';
import { Readable } from 'stream';

const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
    secretKey: process.env.MINIO_SECRET_KEY || 'password',
});

// Define Buckets
const BUCKET_IMAGES = process.env.MINIO_BUCKET_IMAGES || 'images';
const BUCKET_THUMBNAILS = process.env.MINIO_BUCKET_THUMBNAILS || 'thumbnails';

// MIME type to file extension mapping
const mimeToExtension: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/tiff': 'tif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
};

// Helper function to get file extension from MIME type
const getExtensionFromMimeType = (mimeType: string): string => {
    const extension = mimeToExtension[mimeType.toLowerCase()];
    if (!extension) {
        // Fallback: use the part after the slash
        const parts = mimeType.split('/');
        return parts.length > 1 ? parts[1] : 'bin';
    }
    return extension;
};


export const resolvePublicUrl = (internalUrl: string): string => {
  // 1. In Production, we trust the URL is already correct (e.g. s3.myapp.com)
  if (process.env.NODE_ENV !== 'development') {
    return internalUrl;
  }

  // 2. In Development, rewrite Docker network paths to Nginx Localhost
  // We handle both 'minio' (docker service name) and 'localhost' (direct access)
  return internalUrl
    .replace('minio:9000', 'localhost:9999/storage')
    .replace('localhost:9000', 'localhost:9999/storage');
};

/**
 * 1. For USER: Generate URL to upload raw image
 */
export const generatePresignedUrl = async (
    uuid: string,
    mimeType: string
) => {

    const extension = getExtensionFromMimeType(mimeType);
    const objectName = `${uuid}.${extension}`;


    // We use presignedUrl (generic) instead of presignedPutObject
    // to enforce the 'Content-Type' header.
    const imageUrl = await minioClient.presignedUrl(
        'PUT',
        BUCKET_IMAGES,
        objectName,
        15 * 60, // 15 mins
        {
            'Content-Type': mimeType
        }
    );
    const thumbnailUrl = await minioClient.presignedUrl(
        'PUT',
        BUCKET_THUMBNAILS,
        objectName,
        15 * 60, // 15 mins
        {
            'Content-Type': 'image/jpeg'
        }
    );

    // Apply URL resolver to rewrite internal MinIO URLs to nginx proxy URLs
    const resolvedImageUrl = resolvePublicUrl(imageUrl);
    const resolvedThumbnailUrl = resolvePublicUrl(thumbnailUrl);

    return {
        imageUrl: resolvedImageUrl,
        thumbnailUrl: resolvedThumbnailUrl,
        objectName,
        bucketName: BUCKET_IMAGES,
        uuid
    };
};

/**
 * 2. For SERVER: Upload a generated thumbnail directly
 */
export const uploadThumbnail = async (filename: string, buffer: Buffer) => {
    // Upload buffer to THUMBNAILS bucket
    // 'metaData' is optional, but setting Content-Type is good practice
    const metaData = { 'Content-Type': 'image/jpeg' };

    await minioClient.putObject(
        BUCKET_THUMBNAILS,
        filename,
        buffer,
        buffer.length,
        metaData
    );

    return { bucketName: BUCKET_THUMBNAILS, filename };
};

/**
 * 3. Generate presigned GET URL for downloading an image (requires authentication)
 */
export const generatePresignedGetUrl = async (
    uuid: string,
    format: string,
    expirySeconds: number = 3600 // 1 hour default
) => {
    const objectName = `${uuid}.${format}`;

    const url = await minioClient.presignedGetObject(
        BUCKET_IMAGES,
        objectName,
        expirySeconds
    );

    // Apply URL resolver to rewrite internal MinIO URLs to nginx proxy URLs
    return resolvePublicUrl(url);
};

/**
 * 4. Generate public URL for thumbnail (no authentication required)
 * Note: This assumes the thumbnails bucket has a public read policy
 */
export const generateThumbnailPublicUrl = (uuid: string) => {
    const objectName = `${uuid}.jpg`; // Thumbnails are always JPG
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = process.env.MINIO_PORT || '9000';
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const protocol = useSSL ? 'https' : 'http';

    // Construct public URL
    const publicUrl = `${protocol}://${endpoint}:${port}/${BUCKET_THUMBNAILS}/${objectName}`;

    // Apply URL resolver to rewrite internal MinIO URLs to nginx proxy URLs
    return resolvePublicUrl(publicUrl);
};

/**
 * 5. Stream image from MinIO
 */
export const getImageStream = async (uuid: string, format: string) => {
    const objectName = `${uuid}.${format}`;

    const stream = await minioClient.getObject(BUCKET_IMAGES, objectName);

    return stream;
};

/**
 * 6. Stream thumbnail from MinIO
 */
export const getThumbnailStream = async (uuid: string) => {
    const objectName = `${uuid}.jpg`; // Thumbnails are always JPG

    const stream = await minioClient.getObject(BUCKET_THUMBNAILS, objectName);

    return stream;
};

export default minioClient;