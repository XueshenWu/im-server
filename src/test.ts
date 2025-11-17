/**
 * Database Connection Test
 * Run this to verify Drizzle ORM setup
 */

import { db } from './db/index';
import {
  getAllImages,
  createImage,
  getImageStats,
  createImageWithExif,
  getImageWithExif,
} from './db/queries';
import { sql } from 'drizzle-orm';

async function testConnection() {
  console.log('🔍 Testing database connection...\n');

  try {
    // Test 1: Basic connection
    console.log('Test 1: Checking database connection...');
    const result = await db.execute(sql`SELECT current_database(), current_user, version()`);
    console.log('✅ Connected to database:', result.rows[0]);
    console.log('');

    // Test 2: Get all images
    console.log('Test 2: Fetching all images...');
    const images = await getAllImages();
    console.log(`✅ Found ${images.length} images`);
    console.log('');

    // Test 3: Get image statistics
    console.log('Test 3: Fetching image statistics...');
    const stats = await getImageStats();
    console.log('✅ Statistics:', stats);
    console.log('');

    // Test 4: Create a test image (optional - uncomment to test)
    /*
    console.log('Test 4: Creating a test image...');
    const newImage = await createImage({
      filename: 'test-image.jpg',
      originalName: 'my-photo.jpg',
      filePath: '/storage/images/test-image.jpg',
      thumbnailPath: '/storage/thumbnails/test-image.jpg',
      fileSize: 1024000,
      format: 'jpg',
      width: 1920,
      height: 1080,
      hash: 'abcdef1234567890',
      mimeType: 'image/jpeg',
    });
    console.log('✅ Created image:', newImage);
    console.log('');
    */

    // Test 5: Create image with EXIF (optional - uncomment to test)
    /*
    console.log('Test 5: Creating image with EXIF data...');
    const imageWithExif = await createImageWithExif(
      {
        filename: 'test-image-2.jpg',
        originalName: 'vacation.jpg',
        filePath: '/storage/images/test-image-2.jpg',
        thumbnailPath: '/storage/thumbnails/test-image-2.jpg',
        fileSize: 2048000,
        format: 'jpg',
        width: 3840,
        height: 2160,
        hash: 'xyz9876543210',
        mimeType: 'image/jpeg',
      },
      {
        cameraMake: 'Canon',
        cameraModel: 'EOS 5D Mark IV',
        iso: 400,
        shutterSpeed: '1/250',
        aperture: 'f/5.6',
        focalLength: '70mm',
      }
    );
    console.log('✅ Created image with EXIF:', imageWithExif);
    console.log('');
    */

    console.log('🎉 All tests passed!\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

testConnection();
