# API Server - Image Management

Backend API server for the Image Management Electron application with **Drizzle ORM**.

## Tech Stack

- **Node.js** with **TypeScript**
- **Drizzle ORM** - Type-safe database queries
- **PostgreSQL** - Database (via Docker)
- **tsx** - TypeScript execution for development

## Quick Start

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Set Up Environment

```bash
# Copy the example env file
copy .env.example .env

# Edit .env if needed (default values should work)
```

### 3. Start PostgreSQL (Docker)

```bash
# From the project root directory
docker-compose up -d
```

### 4. Push Database Schema

```bash
# This will create all tables in the database
npm run db:push
```

### 5. Test the Connection

```bash
npm test
```

### 6. Start Development Server (when you create the API)

```bash
npm run dev
```

## Drizzle ORM Commands

### Push Schema to Database
```bash
npm run db:push
```
Pushes your Drizzle schema to the database (creates/updates tables).

### Generate Migrations
```bash
npm run db:generate
```
Generates migration SQL files based on schema changes.

### Run Migrations
```bash
npm run db:migrate
```
Applies pending migrations to the database.

### Open Drizzle Studio
```bash
npm run db:studio
```
Opens a visual database browser at `https://local.drizzle.studio`

### Drop Database
```bash
npm run db:drop
```
⚠️ **Warning**: Drops all tables from the database.

## Project Structure

```
server/
├── src/
│   ├── db/
│   │   ├── schema.ts      # Database schema (tables, relations)
│   │   ├── index.ts       # Database connection
│   │   └── queries.ts     # Reusable query functions
│   ├── test.ts            # Database connection test
│   └── index.ts           # (To be created) API server entry point
├── database/
│   └── init/              # SQL initialization scripts (legacy)
├── drizzle/               # Generated migrations
├── drizzle.config.ts      # Drizzle Kit configuration
├── tsconfig.json          # TypeScript configuration
├── package.json           # Dependencies and scripts
└── .env                   # Environment variables
```

## Database Schema

### Tables

**`images`** - Stores image metadata
- id, uuid, filename, originalName, filePath, thumbnailPath
- fileSize, format, width, height, hash, mimeType
- isCorrupted, createdAt, updatedAt, deletedAt

**`exif_data`** - Stores EXIF metadata
- imageId (FK to images), cameraMake, cameraModel, lensModel
- iso, shutterSpeed, aperture, focalLength, dateTaken
- gpsLatitude, gpsLongitude, gpsAltitude, orientation
- metadata (JSONB for additional data)

**`sync_log`** - Tracks sync operations
- operation, imageId, status, errorMessage
- metadata (JSONB), createdAt, completedAt

See [src/db/schema.ts](./src/db/schema.ts) for complete schema.

## Using the Queries

The [src/db/queries.ts](./src/db/queries.ts) file contains type-safe query functions:

```typescript
import {
  getAllImages,
  getImageById,
  createImage,
  createImageWithExif,
  getImageStats
} from './db/queries';

// Get all images
const images = await getAllImages();

// Get single image
const image = await getImageById(1);

// Create new image
const newImage = await createImage({
  filename: 'photo.jpg',
  originalName: 'vacation.jpg',
  filePath: '/storage/images/photo.jpg',
  fileSize: 2048000,
  format: 'jpg',
  width: 1920,
  height: 1080,
  hash: 'abc123...',
  // ... other fields
});

// Get statistics
const stats = await getImageStats();
console.log(stats); // { totalCount, totalSize, corruptedCount, ... }
```

All queries are **fully type-safe** with TypeScript autocomplete!

## PostgreSQL Docker Setup

### Prerequisites

- Docker Desktop installed and running
- Docker Compose V2 (included with Docker Desktop)

### Quick Start

1. **Copy the environment file**:
   ```bash
   cd apiserver
   copy .env.example .env
   ```

2. **Review and modify `.env` if needed** (optional):
   - Change default database credentials
   - Adjust storage paths
   - Configure other settings

3. **Start PostgreSQL**:
   ```bash
   # From the project root directory
   docker-compose up -d
   ```

4. **Verify PostgreSQL is running**:
   ```bash
   docker-compose ps
   ```

   You should see the `image-mgmt-db` container running.

5. **Check logs** (if needed):
   ```bash
   docker-compose logs -f postgres
   ```

### Database Schema

The database will be automatically initialized with the following tables:

- **`images`**: Stores image metadata (filename, size, format, hash, etc.)
- **`exif_data`**: Stores EXIF metadata extracted from images
- **`sync_log`**: Tracks synchronization operations

See [database/init/01-init-schema.sql](./database/init/01-init-schema.sql) for complete schema details.

### Storage Structure

```
storage/
├── images/         # Original uploaded images
└── thumbnails/     # Generated thumbnails
```

### Connecting to PostgreSQL

**Default connection details**:
- Host: `localhost`
- Port: `5432`
- Database: `imagedb`
- User: `imageadmin`
- Password: `imagepass`

**Connection URL**:
```
postgresql://imageadmin:imagepass@localhost:5432/imagedb
```

### Useful Commands

**Start the database**:
```bash
docker-compose up -d
```

**Stop the database**:
```bash
docker-compose down
```

**Stop and remove all data** (⚠️ destructive):
```bash
docker-compose down -v
```

**View logs**:
```bash
docker-compose logs -f postgres
```

**Access PostgreSQL CLI**:
```bash
docker-compose exec postgres psql -U imageadmin -d imagedb
```

**Restart database**:
```bash
docker-compose restart postgres
```

**Check database health**:
```bash
docker-compose exec postgres pg_isready -U imageadmin -d imagedb
```

### Common PostgreSQL Commands

Once inside the PostgreSQL CLI (`psql`):

```sql
-- List all tables
\dt

-- Describe a table
\d images

-- View all images
SELECT * FROM images;

-- View images with EXIF data (using the view)
SELECT * FROM v_images_with_exif;

-- Count total images
SELECT COUNT(*) FROM images;

-- Exit psql
\q
```

### Troubleshooting

**Problem: Port 5432 already in use**

Solution: Change the port in `docker-compose.yml`:
```yaml
ports:
  - "5433:5432"  # Use port 5433 instead
```

Then update `DATABASE_URL` in `.env`:
```
DATABASE_URL=postgresql://imageadmin:imagepass@localhost:5433/imagedb
```

**Problem: Permission denied on storage volumes**

Solution: Ensure the storage directories exist and have proper permissions:
```bash
mkdir -p ../storage/images ../storage/thumbnails
```

**Problem: Database initialization failed**

Solution: Remove the volume and recreate:
```bash
docker-compose down -v
docker-compose up -d
```

**Problem: Can't connect from API server**

Solution: Check that:
1. Container is running: `docker-compose ps`
2. Port is correctly mapped: `docker-compose port postgres 5432`
3. `.env` file has correct credentials
4. Firewall is not blocking port 5432

### Database Backup & Restore

**Backup**:
```bash
docker-compose exec postgres pg_dump -U imageadmin imagedb > backup.sql
```

**Restore**:
```bash
docker-compose exec -T postgres psql -U imageadmin imagedb < backup.sql
```

### Data Persistence

Database data is persisted in a Docker volume named `postgres_data`.

To view volume information:
```bash
docker volume inspect image-management_postgres_data
```

The volume will persist even if you run `docker-compose down`. To remove it, use:
```bash
docker-compose down -v
```

### Next Steps

After setting up PostgreSQL:

1. Install API server dependencies (see main project README)
2. Configure the API server to connect to the database
3. Start the Express.js API server
4. Run the Electron application

## Security Notes

⚠️ **For Development Only**: The default credentials are for development purposes only. In production:

- Use strong, unique passwords
- Store credentials in environment variables
- Never commit `.env` files to version control
- Use SSL/TLS for database connections
- Implement proper authentication and authorization
- Regularly update PostgreSQL to the latest version

## License

See main project LICENSE file.
