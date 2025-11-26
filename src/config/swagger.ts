import swaggerJsdoc from 'swagger-jsdoc';
import { Options } from 'swagger-jsdoc';

const options: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Image Management API',
      version: '1.0.0',
      description: 'API for managing images with EXIF data, thumbnails, and synchronization',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: '',
        description: 'API server',
      },
    ],
    tags: [
      {
        name: 'Images',
        description: 'Image management endpoints',
      },
      {
        name: 'Sync',
        description: 'Synchronization endpoints',
      },
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
    ],
    components: {
      schemas: {
        Image: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            uuid: { type: 'string', format: 'uuid' },
            filename: { type: 'string', example: 'photo.jpg' },
            originalName: { type: 'string', example: 'vacation-photo.jpg' },
            filePath: { type: 'string', example: '/storage/images/photo.jpg' },
            thumbnailPath: { type: 'string', example: '/storage/thumbnails/photo.jpg' },
            fileSize: { type: 'integer', example: 2048000 },
            format: { type: 'string', enum: ['jpg', 'jpeg', 'png', 'tif', 'tiff'] },
            width: { type: 'integer', example: 1920 },
            height: { type: 'integer', example: 1080 },
            hash: { type: 'string', example: 'abc123def456...' },
            mimeType: { type: 'string', example: 'image/jpeg' },
            isCorrupted: { type: 'boolean', default: false },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deletedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ExifData: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            imageId: { type: 'integer' },
            cameraMake: { type: 'string', example: 'Canon' },
            cameraModel: { type: 'string', example: 'EOS 5D Mark IV' },
            lensModel: { type: 'string', example: 'EF 24-70mm f/2.8L II USM' },
            iso: { type: 'integer', example: 400 },
            shutterSpeed: { type: 'string', example: '1/250' },
            aperture: { type: 'string', example: 'f/5.6' },
            focalLength: { type: 'string', example: '70mm' },
            dateTaken: { type: 'string', format: 'date-time' },
            gpsLatitude: { type: 'number', format: 'double' },
            gpsLongitude: { type: 'number', format: 'double' },
            gpsAltitude: { type: 'number', format: 'double' },
            orientation: { type: 'integer' },
            metadata: { type: 'object' },
          },
        },
        ImageStats: {
          type: 'object',
          properties: {
            totalCount: { type: 'integer', example: 100 },
            totalSize: { type: 'integer', example: 52428800 },
            corruptedCount: { type: 'integer', example: 2 },
            jpgCount: { type: 'integer', example: 50 },
            pngCount: { type: 'integer', example: 30 },
            tifCount: { type: 'integer', example: 20 },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Error message' },
            message: { type: 'string', example: 'Detailed error description' },
            statusCode: { type: 'integer', example: 400 },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'], // Path to the API routes
};

export const swaggerSpec = swaggerJsdoc(options);
