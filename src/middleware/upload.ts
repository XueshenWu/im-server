import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { generateUniqueFilename } from '../utils/imageProcessor';

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
 * Multer storage configuration
 */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureStorageDirectories();
    cb(null, IMAGES_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueFilename = generateUniqueFilename(file.originalname);
    cb(null, uniqueFilename);
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
 * Get paths for uploaded files
 */
export function getImagePaths(filename: string) {
  return {
    imagePath: path.join(IMAGES_DIR, filename),
    thumbnailPath: path.join(THUMBNAILS_DIR, filename.replace(/\.[^.]+$/, '.jpg')),
    relativeImagePath: `/storage/images/${filename}`,
    relativeThumbnailPath: `/storage/thumbnails/${filename.replace(/\.[^.]+$/, '.jpg')}`,
  };
}

export { IMAGES_DIR, THUMBNAILS_DIR };
