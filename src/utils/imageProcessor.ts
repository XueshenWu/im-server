import sharp from 'sharp';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import exifr from 'exifr';

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  hash: string;
  isCorrupted: boolean;
}

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
  orientation?: number;
  metadata?: Record<string, any>;
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
export async function extractExifData(filePath: string): Promise<ExifMetadata | null> {
  try {
    const exif = await exifr.parse(filePath, {
      tiff: true,
      exif: true,
      gps: true,
      ifd0: true,
      ifd1: true,
    });

    if (!exif) return null;

    // Convert shutter speed to fraction string
    let shutterSpeed: string | undefined;
    if (exif.ExposureTime) {
      if (exif.ExposureTime < 1) {
        shutterSpeed = `1/${Math.round(1 / exif.ExposureTime)}`;
      } else {
        shutterSpeed = `${exif.ExposureTime}s`;
      }
    }

    // Convert aperture to f-stop string
    let aperture: string | undefined;
    if (exif.FNumber) {
      aperture = `f/${exif.FNumber.toFixed(1)}`;
    } else if (exif.ApertureValue) {
      const fNumber = Math.pow(2, exif.ApertureValue / 2);
      aperture = `f/${fNumber.toFixed(1)}`;
    }

    // Convert focal length to string
    let focalLength: string | undefined;
    if (exif.FocalLength) {
      focalLength = `${exif.FocalLength}mm`;
    }

    return {
      cameraMake: exif.Make,
      cameraModel: exif.Model,
      lensModel: exif.LensModel,
      iso: exif.ISO,
      shutterSpeed,
      aperture,
      focalLength,
      dateTaken: exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal) : undefined,
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
