# Image Management Server Setup Guide

## Overview

This is the backend API server for the Image Management Electron application, now powered by **Vite** for ultra-fast development and optimized builds.

## Technology Stack

- **Build Tool**: Vite (ESM-based, fast HMR)
- **Runtime**: Node.js 18+
- **Framework**: Express.js 5.x
- **Language**: TypeScript
- **Database**: PostgreSQL 16
- **ORM**: Drizzle ORM
- **Image Processing**: Sharp
- **EXIF Extraction**: Exifr
- **File Upload**: Multer
- **API Documentation**: Swagger/OpenAPI

## Project Structure

```
im-server/
├── src/
│   ├── config/          # Configuration files (Swagger, etc.)
│   ├── controllers/     # Route controllers
│   │   └── images.controller.ts
│   ├── db/              # Database layer
│   │   ├── index.ts     # DB connection
│   │   ├── schema.ts    # Drizzle schema definitions
│   │   ├── queries.ts   # Database queries
│   │   └── seed.ts      # Seed data script
│   ├── middleware/      # Express middleware
│   │   ├── errorHandler.ts
│   │   └── upload.ts    # Multer configuration
│   ├── routes/          # API routes
│   │   ├── health.routes.ts
│   │   └── images.routes.ts
│   ├── utils/           # Utility functions
│   │   └── imageProcessor.ts
│   └── index.ts         # Application entry point
├── storage/             # File storage
│   ├── images/          # Uploaded images
│   └── thumbnails/      # Generated thumbnails
├── database/            # Database initialization scripts
├── dist/                # Built output (generated)
├── vite.config.ts       # Vite configuration
├── drizzle.config.ts    # Drizzle Kit configuration
├── docker-compose.yml   # PostgreSQL container
├── package.json
└── tsconfig.json
```

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- PostgreSQL (via Docker)

## Installation

1. **Clone the repository**
   ```bash
   cd im-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` if needed:
   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5430/postgres
   API_PORT=3000
   CORS_ORIGIN=*
   ```

4. **Start PostgreSQL with Docker**
   ```bash
   docker-compose up -d
   ```

5. **Push database schema**
   ```bash
   npm run db:push
   ```

6. **Seed the database (optional)**
   ```bash
   npm run db:seed
   ```

## Development

### Start Development Server with Vite

```bash
npm run dev
```

The server will start at `http://localhost:3000` with:
- Hot Module Replacement (HMR)
- Fast TypeScript compilation via esbuild
- Automatic restart on file changes

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite development server with HMR |
| `npm run build` | Build for production using Vite |
| `npm start` | Run production build |
| `npm run preview` | Preview production build |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run migrations |
| `npm run db:studio` | Open Drizzle Studio (DB GUI) |
| `npm run db:seed` | Seed database with sample data |

## API Endpoints

### Documentation
- **Swagger UI**: http://localhost:3000/api-docs

### Health Check
- `GET /api/health` - Server health status

### Images CRUD
- `GET /api/images` - List all images
  - Query param: `?withExif=true` to include EXIF data
- `GET /api/images/stats` - Get image statistics
- `GET /api/images/:id` - Get image by ID
- `GET /api/images/uuid/:uuid` - Get image by UUID
- `PUT /api/images/:id` - Update image metadata
- `DELETE /api/images/:id` - Soft delete image
- `POST /api/images/upload` - Upload images (multipart/form-data)
  - Field name: `images` (supports multiple files)
  - Max 10 files per request
  - Supported formats: JPG, PNG, TIF/TIFF
  - Max file size: 50MB
- `POST /api/images/batch` - Batch upload (not yet implemented)

### Static Files
- `GET /storage/images/:filename` - Access uploaded images
- `GET /storage/thumbnails/:filename` - Access thumbnails

## Database Schema

### Tables

#### `images`
- `id` - Serial primary key
- `uuid` - Unique identifier (UUID v4)
- `filename` - Stored filename
- `original_name` - Original upload filename
- `file_path` - Relative path to image
- `thumbnail_path` - Relative path to thumbnail
- `file_size` - File size in bytes
- `format` - Image format (jpg, png, tif, etc.)
- `width` - Image width in pixels
- `height` - Image height in pixels
- `hash` - SHA-256 hash for duplicate detection
- `mime_type` - MIME type
- `is_corrupted` - Corruption flag
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp
- `deleted_at` - Soft delete timestamp

#### `exif_data`
- `id` - Serial primary key
- `image_id` - Foreign key to images (cascade delete)
- `camera_make` - Camera manufacturer
- `camera_model` - Camera model
- `lens_model` - Lens model
- `iso` - ISO sensitivity
- `shutter_speed` - Shutter speed
- `aperture` - Aperture (f-stop)
- `focal_length` - Focal length
- `date_taken` - Original capture date
- `gps_latitude` - GPS latitude
- `gps_longitude` - GPS longitude
- `gps_altitude` - GPS altitude
- `orientation` - Image orientation
- `metadata` - Additional EXIF data (JSONB)
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

#### `sync_log`
- `id` - Serial primary key
- `operation` - Operation type (upload, download, sync, etc.)
- `image_id` - Foreign key to images
- `status` - Status (pending, in_progress, completed, failed)
- `error_message` - Error details if failed
- `metadata` - Additional metadata (JSONB)
- `created_at` - Creation timestamp
- `completed_at` - Completion timestamp

## Features Implemented

### ✅ Phase 1.1: Database Seeding
- Seed script with sample images
- EXIF data samples
- Sync log samples
- Run with: `npm run db:seed`

### ✅ Phase 1.2: CRUD Operations
- **Create**: Upload images with automatic processing
  - Hash-based duplicate detection
  - Automatic thumbnail generation (300x300)
  - EXIF data extraction
  - Corruption detection
  - Support for JPG, PNG, TIF/TIFF formats
  - 4K image support
- **Read**:
  - List all images
  - Get single image by ID or UUID
  - Get images with EXIF data
  - Get image statistics
- **Update**: Update image metadata
- **Delete**: Soft delete with `deleted_at` timestamp

### Image Processing Features
- **Validation**: Format and corruption detection using Sharp
- **Thumbnails**: Automatic 300x300 thumbnails with 80% quality
- **EXIF Extraction**: Camera, lens, exposure, GPS data
- **Hash Calculation**: SHA-256 for duplicate detection
- **Error Handling**: Graceful handling of corrupted images

## Vite Configuration

The server uses Vite with `vite-plugin-node` for:
- **Fast HMR**: Instant updates during development
- **esbuild**: Lightning-fast TypeScript compilation
- **Optimized Builds**: Production builds with tree-shaking
- **External Dependencies**: All Node.js modules are externalized

### Why Vite for Backend?

1. **Development Speed**: 10-100x faster than tsc watch mode
2. **Hot Module Replacement**: Instant updates without full restart
3. **Modern ESM**: Native ES module support
4. **Production Ready**: Optimized builds with Rollup
5. **TypeScript**: First-class TypeScript support via esbuild

## Production Build

```bash
# Build the project
npm run build

# Run production server
npm start
```

The build output will be in `dist/index.js` as an ES module.

## Database Management

### Using Drizzle Studio
```bash
npm run db:studio
```
Opens a web-based GUI at `https://local.drizzle.studio`

### Generate Migrations
```bash
npm run db:generate
```

### Apply Migrations
```bash
npm run db:migrate
```

### Reset Database
```bash
npm run db:drop
npm run db:push
npm run db:seed
```

## Testing the API

### Using curl
```bash
# Upload image
curl -X POST http://localhost:3000/api/images/upload \
  -F "images=@/path/to/image.jpg"

# Get all images
curl http://localhost:3000/api/images

# Get image stats
curl http://localhost:3000/api/images/stats
```

### Using Swagger UI
Navigate to http://localhost:3000/api-docs and test all endpoints interactively.

## Troubleshooting

### Port already in use
```bash
# Change port in .env
API_PORT=3001
```

### Database connection issues
```bash
# Check PostgreSQL is running
docker-compose ps

# Restart PostgreSQL
docker-compose restart postgres
```

### Build errors
```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

## Next Steps

- [ ] Implement batch upload from folder config JSON
- [ ] Add pagination and filtering to GET /api/images
- [ ] Implement sync endpoints
- [ ] Add rate limiting
- [ ] Add authentication/authorization
- [ ] Implement WebSocket for real-time updates
- [ ] Add image cropping endpoint
- [ ] Implement EXIF editing

## License

ISC
