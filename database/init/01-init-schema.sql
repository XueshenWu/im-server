-- Image Management Database Schema
-- PostgreSQL 16

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Images table
CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    thumbnail_path TEXT,
    file_size BIGINT NOT NULL,
    format VARCHAR(10) NOT NULL CHECK (format IN ('jpg', 'jpeg', 'png', 'tif', 'tiff')),
    width INTEGER,
    height INTEGER,
    hash VARCHAR(64) NOT NULL,
    mime_type VARCHAR(50),
    is_corrupted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- EXIF data table
CREATE TABLE IF NOT EXISTS exif_data (
    id SERIAL PRIMARY KEY,
    image_id INTEGER REFERENCES images(id) ON DELETE CASCADE,
    camera_make VARCHAR(100),
    camera_model VARCHAR(100),
    lens_model VARCHAR(100),
    iso INTEGER,
    shutter_speed VARCHAR(50),
    aperture VARCHAR(50),
    focal_length VARCHAR(50),
    date_taken TIMESTAMP WITH TIME ZONE,
    gps_latitude DECIMAL(10, 8),
    gps_longitude DECIMAL(11, 8),
    gps_altitude DECIMAL(10, 2),
    orientation INTEGER,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(image_id)
);

-- Sync log table (for tracking sync operations)
CREATE TABLE IF NOT EXISTS sync_log (
    id SERIAL PRIMARY KEY,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('upload', 'download', 'update', 'delete', 'conflict')),
    image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    action_type VARCHAR(20) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    action_group_id UUID,
    error_message TEXT,
    user_id INTEGER
);

-- Create indexes for better performance
CREATE INDEX idx_images_hash ON images(hash);
CREATE INDEX idx_images_format ON images(format);
CREATE INDEX idx_images_created_at ON images(created_at DESC);
CREATE INDEX idx_images_updated_at ON images(updated_at DESC);
CREATE INDEX idx_images_deleted_at ON images(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_images_uuid ON images(uuid);

CREATE INDEX idx_exif_image_id ON exif_data(image_id);
CREATE INDEX idx_exif_date_taken ON exif_data(date_taken);
CREATE INDEX idx_exif_metadata ON exif_data USING GIN (metadata);

CREATE INDEX idx_sync_log_status ON sync_log(status);
CREATE INDEX idx_sync_log_created_at ON sync_log(created_at DESC);
CREATE INDEX idx_sync_log_action_group_id ON sync_log(action_group_id) WHERE action_group_id IS NOT NULL;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_images_updated_at BEFORE UPDATE ON images
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exif_data_updated_at BEFORE UPDATE ON exif_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE images IS 'Stores metadata for uploaded images';
COMMENT ON TABLE exif_data IS 'Stores EXIF metadata extracted from images';
COMMENT ON TABLE sync_log IS 'Tracks synchronization operations between client and server';

COMMENT ON COLUMN images.hash IS 'SHA-256 hash for detecting file changes and duplicates';
COMMENT ON COLUMN images.is_corrupted IS 'Flag indicating if image failed validation during upload';
COMMENT ON COLUMN exif_data.metadata IS 'Additional EXIF data in JSON format';
