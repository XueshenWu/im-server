-- Seed Data for Testing
-- This file is optional and provides sample data for development

-- Note: Uncomment the following lines if you want to add sample data

/*
-- Sample images (for testing only)
INSERT INTO images (filename, original_name, file_path, thumbnail_path, file_size, format, width, height, hash, mime_type) VALUES
('sample-image-1.jpg', 'vacation-photo.jpg', '/storage/images/sample-image-1.jpg', '/storage/thumbnails/sample-image-1.jpg', 2048576, 'jpg', 3840, 2160, 'abc123def456', 'image/jpeg'),
('sample-image-2.png', 'screenshot.png', '/storage/images/sample-image-2.png', '/storage/thumbnails/sample-image-2.png', 1024000, 'png', 1920, 1080, 'def789ghi012', 'image/png'),
('sample-image-3.tif', 'scan-document.tif', '/storage/images/sample-image-3.tif', '/storage/thumbnails/sample-image-3.tif', 5242880, 'tif', 4096, 4096, 'ghi345jkl678', 'image/tiff');

-- Sample EXIF data
INSERT INTO exif_data (image_id, camera_make, camera_model, iso, shutter_speed, aperture, focal_length, date_taken, orientation) VALUES
(1, 'Canon', 'EOS 5D Mark IV', 400, '1/250', 'f/5.6', '70mm', '2024-01-15 14:30:00', 1),
(2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1);

-- Sample sync log entries
INSERT INTO sync_log (operation, image_id, status, completed_at) VALUES
('upload', 1, 'completed', NOW() - INTERVAL '1 hour'),
('upload', 2, 'completed', NOW() - INTERVAL '30 minutes'),
('upload', 3, 'completed', NOW() - INTERVAL '15 minutes');
*/

-- Create a view for easy querying of images with EXIF data
CREATE OR REPLACE VIEW v_images_with_exif AS
SELECT
    i.id,
    i.uuid,
    i.filename,
    i.original_name,
    i.file_path,
    i.thumbnail_path,
    i.file_size,
    i.format,
    i.width,
    i.height,
    i.hash,
    i.mime_type,
    i.is_corrupted,
    i.created_at,
    i.updated_at,
    e.camera_make,
    e.camera_model,
    e.iso,
    e.shutter_speed,
    e.aperture,
    e.focal_length,
    e.date_taken,
    e.gps_latitude,
    e.gps_longitude,
    e.orientation,
    e.metadata as exif_metadata
FROM images i
LEFT JOIN exif_data e ON i.id = e.image_id
WHERE i.deleted_at IS NULL;

COMMENT ON VIEW v_images_with_exif IS 'Convenient view joining images with their EXIF data';
