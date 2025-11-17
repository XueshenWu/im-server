import { db } from './index';
import { images, exifData, syncLog } from './schema';
import { createHash } from 'crypto';

/**
 * Seed database with sample data for testing
 */
async function seed() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // Sample image data
    const sampleImages = [
      {
        filename: 'sample-landscape-1.jpg',
        originalName: 'mountain-landscape.jpg',
        filePath: '/storage/images/sample-landscape-1.jpg',
        thumbnailPath: '/storage/thumbnails/sample-landscape-1.jpg',
        fileSize: 2548736, // ~2.5MB
        format: 'jpg',
        width: 4000,
        height: 3000,
        hash: createHash('sha256').update('sample-landscape-1').digest('hex'),
        mimeType: 'image/jpeg',
        isCorrupted: false,
      },
      {
        filename: 'sample-portrait-1.png',
        originalName: 'family-portrait.png',
        filePath: '/storage/images/sample-portrait-1.png',
        thumbnailPath: '/storage/thumbnails/sample-portrait-1.png',
        fileSize: 5242880, // ~5MB
        format: 'png',
        width: 3000,
        height: 4000,
        hash: createHash('sha256').update('sample-portrait-1').digest('hex'),
        mimeType: 'image/png',
        isCorrupted: false,
      },
      {
        filename: 'sample-4k-photo.tif',
        originalName: 'professional-4k-shot.tif',
        filePath: '/storage/images/sample-4k-photo.tif',
        thumbnailPath: '/storage/thumbnails/sample-4k-photo.tif',
        fileSize: 31457280, // ~30MB
        format: 'tif',
        width: 3840,
        height: 2160,
        hash: createHash('sha256').update('sample-4k-photo').digest('hex'),
        mimeType: 'image/tiff',
        isCorrupted: false,
      },
      {
        filename: 'sample-corrupted.jpg',
        originalName: 'broken-image.jpg',
        filePath: '/storage/images/sample-corrupted.jpg',
        thumbnailPath: null,
        fileSize: 1024,
        format: 'jpg',
        width: null,
        height: null,
        hash: createHash('sha256').update('sample-corrupted').digest('hex'),
        mimeType: 'image/jpeg',
        isCorrupted: true,
      },
      {
        filename: 'sample-city-night.jpg',
        originalName: 'city-nightscape.jpg',
        filePath: '/storage/images/sample-city-night.jpg',
        thumbnailPath: '/storage/thumbnails/sample-city-night.jpg',
        fileSize: 3145728, // ~3MB
        format: 'jpg',
        width: 3840,
        height: 2160,
        hash: createHash('sha256').update('sample-city-night').digest('hex'),
        mimeType: 'image/jpeg',
        isCorrupted: false,
      },
      {
        filename: 'sample-nature-macro.png',
        originalName: 'flower-macro.png',
        filePath: '/storage/images/sample-nature-macro.png',
        thumbnailPath: '/storage/thumbnails/sample-nature-macro.png',
        fileSize: 4194304, // ~4MB
        format: 'png',
        width: 2560,
        height: 1440,
        hash: createHash('sha256').update('sample-nature-macro').digest('hex'),
        mimeType: 'image/png',
        isCorrupted: false,
      },
      {
        filename: 'sample-architecture.tiff',
        originalName: 'modern-building.tiff',
        filePath: '/storage/images/sample-architecture.tiff',
        thumbnailPath: '/storage/thumbnails/sample-architecture.tiff',
        fileSize: 28311552, // ~27MB
        format: 'tiff',
        width: 4096,
        height: 2160,
        hash: createHash('sha256').update('sample-architecture').digest('hex'),
        mimeType: 'image/tiff',
        isCorrupted: false,
      },
      {
        filename: 'sample-sunset.jpg',
        originalName: 'beach-sunset.jpg',
        filePath: '/storage/images/sample-sunset.jpg',
        thumbnailPath: '/storage/thumbnails/sample-sunset.jpg',
        fileSize: 2097152, // ~2MB
        format: 'jpg',
        width: 1920,
        height: 1080,
        hash: createHash('sha256').update('sample-sunset').digest('hex'),
        mimeType: 'image/jpeg',
        isCorrupted: false,
      },
    ];

    // Insert images
    console.log('📸 Inserting sample images...');
    const insertedImages = await db.insert(images).values(sampleImages).returning();
    console.log(`✅ Inserted ${insertedImages.length} images\n`);

    // Sample EXIF data for some images
    const sampleExifData = [
      {
        imageId: insertedImages[0].id,
        cameraMake: 'Canon',
        cameraModel: 'EOS 5D Mark IV',
        lensModel: 'EF 24-70mm f/2.8L II USM',
        iso: 100,
        shutterSpeed: '1/125',
        aperture: 'f/8.0',
        focalLength: '35mm',
        dateTaken: new Date('2024-01-15T10:30:00Z'),
        gpsLatitude: '46.8182',
        gpsLongitude: '8.2275',
        gpsAltitude: '1800.5',
        orientation: 1,
        metadata: {
          software: 'Adobe Lightroom Classic 13.0',
          copyright: 'John Photographer',
        },
      },
      {
        imageId: insertedImages[1].id,
        cameraMake: 'Nikon',
        cameraModel: 'D850',
        lensModel: 'AF-S NIKKOR 85mm f/1.4G',
        iso: 400,
        shutterSpeed: '1/200',
        aperture: 'f/2.0',
        focalLength: '85mm',
        dateTaken: new Date('2024-02-20T14:45:00Z'),
        orientation: 1,
        metadata: {
          flash: 'Did not fire',
          exposureMode: 'Manual',
        },
      },
      {
        imageId: insertedImages[2].id,
        cameraMake: 'Sony',
        cameraModel: 'Alpha A7R IV',
        lensModel: 'FE 24-105mm F4 G OSS',
        iso: 200,
        shutterSpeed: '1/500',
        aperture: 'f/5.6',
        focalLength: '50mm',
        dateTaken: new Date('2024-03-10T16:20:00Z'),
        gpsLatitude: '40.7128',
        gpsLongitude: '-74.0060',
        orientation: 1,
        metadata: {
          colorSpace: 'Adobe RGB',
          whiteBalance: 'Auto',
        },
      },
      {
        imageId: insertedImages[4].id,
        cameraMake: 'Canon',
        cameraModel: 'EOS R5',
        lensModel: 'RF 15-35mm F2.8L IS USM',
        iso: 3200,
        shutterSpeed: '1/60',
        aperture: 'f/2.8',
        focalLength: '24mm',
        dateTaken: new Date('2024-04-05T21:15:00Z'),
        gpsLatitude: '35.6762',
        gpsLongitude: '139.6503',
        orientation: 1,
        metadata: {
          exposureCompensation: '+0.7',
          meteringMode: 'Center-weighted average',
        },
      },
      {
        imageId: insertedImages[5].id,
        cameraMake: 'Fujifilm',
        cameraModel: 'X-T4',
        lensModel: 'XF 80mm F2.8 R LM OIS WR Macro',
        iso: 160,
        shutterSpeed: '1/250',
        aperture: 'f/4.0',
        focalLength: '80mm',
        dateTaken: new Date('2024-05-12T11:00:00Z'),
        orientation: 1,
        metadata: {
          filmSimulation: 'Velvia',
          focusMode: 'Manual',
        },
      },
    ];

    console.log('📊 Inserting EXIF data...');
    const insertedExif = await db.insert(exifData).values(sampleExifData).returning();
    console.log(`✅ Inserted ${insertedExif.length} EXIF records\n`);

    // Sample sync logs
    const sampleSyncLogs = [
      {
        operation: 'upload',
        imageId: insertedImages[0].id,
        status: 'completed' as const,
        metadata: { source: 'desktop-client', duration: 1250 },
        completedAt: new Date('2024-01-15T10:35:00Z'),
      },
      {
        operation: 'upload',
        imageId: insertedImages[1].id,
        status: 'completed' as const,
        metadata: { source: 'desktop-client', duration: 2100 },
        completedAt: new Date('2024-02-20T14:50:00Z'),
      },
      {
        operation: 'upload',
        imageId: insertedImages[2].id,
        status: 'completed' as const,
        metadata: { source: 'batch-import', duration: 5400 },
        completedAt: new Date('2024-03-10T16:25:00Z'),
      },
      {
        operation: 'upload',
        imageId: insertedImages[3].id,
        status: 'failed' as const,
        errorMessage: 'Image file is corrupted',
        metadata: { source: 'desktop-client' },
        completedAt: new Date('2024-03-15T09:12:00Z'),
      },
      {
        operation: 'sync',
        imageId: insertedImages[4].id,
        status: 'completed' as const,
        metadata: { direction: 'server-to-local', duration: 850 },
        completedAt: new Date('2024-04-05T21:20:00Z'),
      },
    ];

    console.log('🔄 Inserting sync logs...');
    const insertedLogs = await db.insert(syncLog).values(sampleSyncLogs).returning();
    console.log(`✅ Inserted ${insertedLogs.length} sync log entries\n`);

    // Display summary
    console.log('📊 Seeding Summary:');
    console.log('─────────────────────────────────────');
    console.log(`✅ Total images: ${insertedImages.length}`);
    console.log(`   - JPG/JPEG: ${insertedImages.filter(i => i.format === 'jpg').length}`);
    console.log(`   - PNG: ${insertedImages.filter(i => i.format === 'png').length}`);
    console.log(`   - TIF/TIFF: ${insertedImages.filter(i => ['tif', 'tiff'].includes(i.format)).length}`);
    console.log(`   - Corrupted: ${insertedImages.filter(i => i.isCorrupted).length}`);
    console.log(`✅ EXIF records: ${insertedExif.length}`);
    console.log(`✅ Sync logs: ${insertedLogs.length}`);
    console.log('─────────────────────────────────────');
    console.log('🎉 Database seeding completed successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

// Run seed if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}

export { seed };
