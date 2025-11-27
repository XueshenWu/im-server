import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getFileExtension } from '../utils/imageProcessor';

// Allowed image formats
const ALLOWED_FORMATS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'];

// Max file size (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Storage paths
const STORAGE_BASE = './storage';
const IMAGES_DIR = path.join(STORAGE_BASE, 'images');
const THUMBNAILS_DIR = path.join(STORAGE_BASE, 'thumbnails');

/**
 * Ensure storage directories exist
 */
export async function ensureStorageDirectories(): Promise<void> {
  for (const dir of [IMAGES_DIR, THUMBNAILS_DIR]) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}

/**
 * Multer storage configuration - UUID-based naming
 * Files are stored as: {uuid}.{format}
 */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureStorageDirectories();
    cb(null, IMAGES_DIR);
  },
  filename: (req, file, cb) => {
    // Generate UUID and keep original extension
    const ext = path.extname(file.originalname).toLowerCase();
    const uuid = uuidv4();
    cb(null, `${uuid}${ext}`);
  },
});

/**
 * File filter to validate image types
 */
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_FORMATS.includes(ext)) {
    return cb(new Error(`Invalid file format. Allowed formats: ${ALLOWED_FORMATS.join(', ')}`));
  }

  cb(null, true);
};

/**
 * Multer upload configuration
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

/**
 * Get paths for UUID-based files
 * @param uuid - Image UUID from database
 * @param format - File format/extension (e.g., 'jpg', 'png')
 */
export function getImagePaths(uuid: string, format: string) {
  const filename = `${uuid}.${format}`;
  const thumbnailFilename = `${uuid}.jpg`; // Thumbnails are always JPEG

  return {
    imagePath: path.join(IMAGES_DIR, filename),
    thumbnailPath: path.join(THUMBNAILS_DIR, thumbnailFilename),
  };
}

/**
 * Get paths from temporary uploaded filename
 * Used during upload processing before UUID is assigned
 */
export function getTempImagePaths(tempFilename: string) {
  return {
    imagePath: path.join(IMAGES_DIR, tempFilename),
    thumbnailPath: path.join(THUMBNAILS_DIR, tempFilename.replace(/\.[^.]+$/, '.jpg')),
  };
}

export { IMAGES_DIR, THUMBNAILS_DIR };
