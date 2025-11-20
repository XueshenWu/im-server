import multer from 'multer';

// Max chunk size (15MB per chunk - includes multipart form overhead)
// Actual chunk data should be ~10MB, but form boundaries add extra bytes
const MAX_CHUNK_SIZE = 15 * 1024 * 1024;

/**
 * Multer configuration for chunk uploads
 * Uses memory storage since chunks are temporary
 */
export const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CHUNK_SIZE,
    fieldSize: MAX_CHUNK_SIZE, // Also increase field size limit
  },
});
