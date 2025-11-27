import sharp from 'sharp';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import exifr from 'exifr';
import logger from '../config/logger';

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  hash: string;
  isCorrupted: boolean;
}



/**
 * Process image and extract metadata
 */
export async function processImage(filePath: string): Promise<ImageMetadata> {
  try {
    // Read file for hash calculation
    const fileBuffer = await fs.readFile(filePath);
    const hash = createHash('sha256').update(fileBuffer).digest('hex');

    // Get image metadata using sharp
    const metadata = await sharp(filePath).metadata();

    if (!metadata.width || !metadata.height || !metadata.format) {
      return {
        width: 0,
        height: 0,
        format: '',
        size: fileBuffer.length,
        hash,
        isCorrupted: true,
      };
    }

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: fileBuffer.length,
      hash,
      isCorrupted: false,
    };
  } catch (error) {
    // If sharp fails to process, image is corrupted
    const fileBuffer = await fs.readFile(filePath);
    const hash = createHash('sha256').update(fileBuffer).digest('hex');

    return {
      width: 0,
      height: 0,
      format: '',
      size: fileBuffer.length,
      hash,
      isCorrupted: true,
    };
  }
}

/**
 * Validate image file
 */
export async function validateImage(filePath: string): Promise<boolean> {
  try {
    await sharp(filePath).metadata();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate thumbnail for image
 */
export async function generateThumbnail(
  sourcePath: string,
  outputPath: string,
  width: number = 300,
  height: number = 300
): Promise<void> {
  await sharp(sourcePath)
    .resize(width, height, {
      fit: 'cover',
      position: 'center',
    })
    .jpeg({ quality: 80 })
    .toFile(outputPath);
}

/**
 * Extract EXIF data from image
 */


// Define the interface so TypeScript doesn't complain
export interface ExifMetadata {
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  iso?: number;
  shutterSpeed?: string;
  aperture?: string;
  focalLength?: string;
  dateTaken?: Date;
  gpsLatitude?: string;
  gpsLongitude?: string;
  gpsAltitude?: string;
  orientation?: string;
  metadata: {
    software?: string;
    copyright?: string;
    artist?: string;
    whiteBalance?: string;
    flash?: string;
    exposureMode?: string;
    meteringMode?: string;
    colorSpace?: string;
  };
}

export async function extractExifData(filePath: string): Promise<ExifMetadata | null> {
  try {
    // Note: If running in Electron Renderer without Node Integration, 
    // you might need to pass a Blob/File object instead of a filePath string.
    const exif = await exifr.parse(filePath, {
      tiff: true,
      exif: true,
      gps: true,
      ifd1: true,
    });

    if (!exif) return null;

    // --- 1. Fix Shutter Speed (Handle edge cases) ---
    let shutterSpeed: string | undefined;
    if (exif.ExposureTime) {
      if (exif.ExposureTime < 1) {
        // Round to nearest denominator to avoid "1/33.333333"
        const denominator = Math.round(1 / exif.ExposureTime);
        shutterSpeed = `1/${denominator}`;
      } else {
        shutterSpeed = `${exif.ExposureTime}s`;
      }
    }

    // --- 2. Fix Aperture (Prioritize FNumber) ---
    let aperture: string | undefined;
    if (exif.FNumber) {
      aperture = `f/${exif.FNumber.toFixed(1)}`;
    } else if (exif.ApertureValue) {
      // Convert APEX ApertureValue to F-Number
      const fNumber = Math.pow(2, exif.ApertureValue / 2);
      aperture = `f/${fNumber.toFixed(1)}`;
    }

    // --- 3. CRITICAL FIX: Date Parsing ---
    // EXIF dates use "YYYY:MM:DD HH:MM:SS". JS Date() often fails to parse this.
    let dateTaken: Date | undefined;
    if (exif.DateTimeOriginal) {
      // Convert "2023:11:26 14:00:00" -> "2023-11-26T14:00:00"
      // This ensures consistent parsing across environments
      const dateString = exif.DateTimeOriginal.toString().trim();
      
      // Regex check to ensure we have the colon format before replacing
      if (/^\d{4}:\d{2}:\d{2}/.test(dateString)) {
         const isoString = dateString.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3T');
         const parsedDate = new Date(isoString);
         if (!isNaN(parsedDate.getTime())) {
             dateTaken = parsedDate;
         }
      } else {
          // Fallback if exifr already converted it to a Date object or other format
          const parsedDate = new Date(dateString);
           if (!isNaN(parsedDate.getTime())) {
             dateTaken = parsedDate;
         }
      }
    }

    return {
      cameraMake: exif.Make,
      cameraModel: exif.Model,
      lensModel: exif.LensModel,
      iso: exif.ISO,
      shutterSpeed,
      aperture,
      focalLength: exif.FocalLength ? `${exif.FocalLength}mm` : undefined,
      dateTaken,
      // exifr usually returns numbers for GPS; safeguard with optional chaining
      gpsLatitude: exif.latitude?.toString(),
      gpsLongitude: exif.longitude?.toString(),
      gpsAltitude: exif.altitude?.toString(),
      orientation: exif.Orientation,
      metadata: {
        software: exif.Software,
        copyright: exif.Copyright,
        artist: exif.Artist,
        whiteBalance: exif.WhiteBalance,
        flash: exif.Flash,
        exposureMode: exif.ExposureMode,
        meteringMode: exif.MeteringMode,
        colorSpace: exif.ColorSpace,
      },
    };
  } catch (error) {
    console.error('Error extracting EXIF data:', error);
    return null;
  }
}

/**
 * Ensure directory exists
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  return path.extname(filename).toLowerCase().replace('.', '');
}

/**
 * Generate unique filename
 */
export function generateUniqueFilename(originalName: string): string {
  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const baseName = path.basename(originalName, ext).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return `${baseName}-${timestamp}-${random}${ext}`;
}

/**
 * Generate image URL from UUID
 * @param uuid - Image UUID
 * @returns URL path to access the image file
 */
export function getImageUrl(uuid: string): string {
  return `/api/images/file/uuid/${uuid}`;
}

/**
 * Generate thumbnail URL from UUID
 * @param uuid - Image UUID
 * @returns URL path to access the thumbnail file
 */
export function getThumbnailUrl(uuid: string): string {
  return `/api/images/thumbnail/uuid/${uuid}`;
}
