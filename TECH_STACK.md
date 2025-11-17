# Technology Stack

Complete technology stack for the Electron Image Management Application.

---

## Frontend Technologies

### Core Framework
- **Electron** `^39.2.1` - Cross-platform desktop application framework
- **React** `^18.3.0` - UI library for building user interfaces
- **TypeScript** `^5.9.3` - Type-safe JavaScript superset
- **Vite** `^7.2.2` - Fast build tool and development server

### Electron Build Tools
- **vite-plugin-electron** `^0.29.0` - Vite plugin for Electron
- **vite-plugin-electron-renderer** `^0.14.6` - Renderer process integration
- **electron-builder** `^26.0.12` - Package and build for distribution

### UI Framework & Styling
- **Tailwind CSS** `^3.4.0` - Utility-first CSS framework
- **shadcn/ui** - High-quality React components built on Radix UI
  - **@radix-ui/react-*** - Accessible component primitives
  - **class-variance-authority** - CSS variant management
  - **clsx** - Conditional className utility
  - **tailwind-merge** - Merge Tailwind classes without conflicts

### Routing & State Management
- **React Router DOM** `^6.26.0` - Client-side routing
- **Zustand** `^5.0.0` - Lightweight state management
  - Alternative: **Redux Toolkit** (if more complex state needed)

### Image Handling & Visualization
- **react-zoom-pan-pinch** `^3.6.0` - Pan and zoom for images
  - Alternative: **react-image-pan-zoom-rotate**
- **react-virtuoso** `^4.10.0` - Virtual scrolling for gallery
  - Alternative: **react-window** `^1.8.10`
- **react-dropzone** `^14.2.0` - Drag and drop file upload

### Internationalization (i18n)
- **i18next** `^24.2.0` - Internationalization framework
- **react-i18next** `^15.1.0` - React bindings for i18next
- **i18next-browser-languagedetector** `^8.0.0` - Auto-detect user language

### HTTP Client
- **axios** `^1.7.0` - Promise-based HTTP client
  - Alternative: Native **fetch** API

### Form Handling & Validation
- **react-hook-form** `^7.53.0` - Performant form management
- **zod** `^3.23.0` - TypeScript-first schema validation

### UI Utilities
- **lucide-react** `^0.460.0` - Icon library (used by shadcn/ui)
- **date-fns** `^4.1.0` - Date manipulation and formatting
- **file-saver** `^2.0.5` - Save files from browser
- **react-hot-toast** `^2.4.1` - Toast notifications
  - Alternative: **sonner** (shadcn/ui native)

---

## Backend Technologies

### Core Framework
- **Node.js** `>=18.0.0` - JavaScript runtime
- **Express.js** `^4.21.0` - Web application framework
- **TypeScript** `^5.9.3` - Type-safe backend code

### Database
- **PostgreSQL** `^16` - Relational database (via Docker)
- **pg** `^8.13.0` - PostgreSQL client for Node.js
- **pg-pool** - Connection pooling

### File Upload & Storage
- **multer** `^1.4.5-lts.1` - Multipart/form-data handling
- **sharp** `^0.33.0` - High-performance image processing
  - Thumbnail generation
  - Image validation
  - Format conversion
  - Compression

### Image Processing & Metadata
- **exifr** `^7.1.3` - EXIF metadata extraction
  - Alternative: **exif-parser** `^0.1.12`
- **image-size** `^1.1.1` - Get image dimensions
- **file-type** `^19.6.0` - Detect file type from buffer

### Validation & Security
- **joi** `^17.13.0` - Schema validation for API requests
  - Alternative: **zod** (shared with frontend)
- **helmet** `^8.0.0` - Security middleware
- **cors** `^2.8.5` - CORS middleware
- **express-rate-limit** `^7.4.0` - Rate limiting

### Utilities
- **dotenv** `^16.4.0` - Environment variable management
- **winston** `^3.17.0` - Logging framework
- **uuid** `^11.0.5` - Generate unique IDs
- **crypto** (built-in) - File hashing for change detection

---

## Database & Infrastructure

### Database
- **PostgreSQL** `16-alpine` - Docker image
- **Database Schema**:
  ```sql
  -- images table
  id SERIAL PRIMARY KEY
  filename VARCHAR(255) NOT NULL
  original_name VARCHAR(255)
  file_path TEXT NOT NULL
  thumbnail_path TEXT
  file_size BIGINT
  format VARCHAR(10) (jpg, png, tif)
  width INTEGER
  height INTEGER
  hash VARCHAR(64) (SHA-256 for change detection)
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()

  -- exif_data table (optional)
  id SERIAL PRIMARY KEY
  image_id INTEGER REFERENCES images(id) ON DELETE CASCADE
  camera_make VARCHAR(100)
  camera_model VARCHAR(100)
  iso INTEGER
  shutter_speed VARCHAR(50)
  aperture VARCHAR(50)
  focal_length VARCHAR(50)
  date_taken TIMESTAMP
  gps_latitude DECIMAL(10, 8)
  gps_longitude DECIMAL(11, 8)
  orientation INTEGER
  metadata JSONB (for additional EXIF data)
  ```

### Containerization
- **Docker** `>=24.0` - Containerization platform
- **Docker Compose** `>=2.20` - Multi-container orchestration
- **docker-compose.yml** structure:
  ```yaml
  services:
    postgres:
      image: postgres:16-alpine
      volumes:
        - postgres_data:/var/lib/postgresql/data
        - ./storage:/storage (mounted storage)
      environment:
        POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

    api:
      build: ./server
      depends_on: [postgres]
      volumes:
        - ./storage:/storage
      ports: [3000:3000]
  ```

---

## Optional/Bonus Technologies

### WASM (WebAssembly) - Choose ONE

**Option A: Image Processing WASM**
- **@assemblyscript/loader** - Load AssemblyScript WASM
- **assemblyscript** - TypeScript-to-WASM compiler
- Use case: Client-side image filters, effects

**Option B: Rust-based WASM**
- **wasm-pack** - Build Rust for WASM
- **wasm-bindgen** - Rust-JS bindings
- Use case: High-performance image manipulation

**Option C: Existing WASM Libraries**
- **squoosh** (from Google Chrome Labs) - Image compression
- **image-rs** bindings - Rust image library for WASM

### Native Addon (N-API) - Alternative to WASM

**Option: Node.js Native Addon**
- **node-addon-api** - C++ addon wrapper
- **node-gyp** - Build tool for native addons
- **libvips** bindings - Fast image processing library
- Use case: Server-side thumbnail generation

### Advanced Features
- **IndexedDB** - Browser storage for offline image cache
  - **idb** `^8.0.0` - Promise-based IndexedDB wrapper
- **Web Workers** - Background processing
  - **comlink** `^4.4.0` - Web Worker communication
- **Service Worker** - Offline support and caching

---

## Development Tools

### Code Quality
- **ESLint** `^9.0.0` - JavaScript/TypeScript linter
  - **@typescript-eslint/parser**
  - **@typescript-eslint/eslint-plugin**
  - **eslint-plugin-react**
  - **eslint-plugin-react-hooks**
- **Prettier** `^3.3.0` - Code formatter
- **husky** `^9.1.0` - Git hooks
- **lint-staged** `^15.2.0` - Run linters on staged files

### TypeScript Configuration
- **@types/node** `^24.10.1`
- **@types/react** `^18.3.0`
- **@types/react-dom** `^18.3.0`
- **@types/express** `^5.0.0`

### Testing (Optional but Recommended)
- **Vitest** `^2.1.0` - Fast unit testing (Vite-native)
- **@testing-library/react** `^16.1.0` - React component testing
- **@testing-library/user-event** `^14.5.0` - User interaction testing
- **Playwright** `^1.49.0` - E2E testing for Electron
  - **@playwright/test**

### Build & Development
- **concurrently** `^9.1.0` - Run multiple commands concurrently
- **nodemon** `^3.1.0` - Auto-restart server on changes
- **cross-env** `^7.0.3` - Cross-platform environment variables

---

## Project Configuration Files

### Essential Config Files

**`package.json`** - Already configured
```json
{
  "scripts": {
    "dev": "vite",
    "server": "nodemon server/index.ts",
    "dev:all": "concurrently \"npm run dev\" \"npm run server\"",
    "build": "tsc && vite build && electron-builder",
    "build:win": "tsc && vite build && electron-builder --win",
    "lint": "eslint . --ext ts,tsx",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\""
  }
}
```

**`tsconfig.json`** - TypeScript config for renderer
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**`tsconfig.node.json`** - Already exists (for Vite config)

**`vite.config.ts`** - Already configured

**`tailwind.config.js`** - To be created
```js
module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      // shadcn/ui theme extensions
    }
  },
  plugins: [require("tailwindcss-animate")]
}
```

**`docker-compose.yml`** - To be created
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    container_name: image-mgmt-db
    environment:
      POSTGRES_USER: imageadmin
      POSTGRES_PASSWORD: imagepass
      POSTGRES_DB: imagedb
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./storage:/storage
    restart: unless-stopped

volumes:
  postgres_data:
```

**`.env.example`** - To be created
```
# Database
DATABASE_URL=postgresql://imageadmin:imagepass@localhost:5432/imagedb

# Server
API_PORT=3000
NODE_ENV=development

# File Storage
STORAGE_PATH=./storage
THUMBNAIL_PATH=./storage/thumbnails
MAX_FILE_SIZE=52428800

# Sync
SYNC_STRATEGY=last_write_wins
```

---

## Installation Commands

### Initial Setup
```bash
# Clone repository
git clone <your-repo-url>
cd image-management

# Install dependencies
npm install

# Install shadcn/ui CLI
npx shadcn@latest init

# Install i18n
npm install i18next react-i18next i18next-browser-languagedetector

# Install UI dependencies
npm install react-router-dom zustand axios
npm install react-hook-form zod
npm install react-zoom-pan-pinch react-virtuoso react-dropzone
npm install lucide-react date-fns file-saver sonner

# Install dev dependencies
npm install -D @types/react @types/react-dom
npm install -D eslint prettier
npm install -D tailwindcss postcss autoprefixer
npm install -D concurrently nodemon

# Backend dependencies (in separate server folder or same package)
npm install express pg multer sharp exifr
npm install helmet cors express-rate-limit
npm install dotenv winston joi uuid
npm install -D @types/express @types/node @types/multer
```

### shadcn/ui Components to Install
```bash
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add tabs
npx shadcn@latest add input
npx shadcn@latest add select
npx shadcn@latest add progress
npx shadcn@latest add scroll-area
npx shadcn@latest add dropdown-menu
npx shadcn@latest add badge
npx shadcn@latest add separator
npx shadcn@latest add toast
npx shadcn@latest add switch
npx shadcn@latest add checkbox
```

---

## Recommended VS Code Extensions

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Tailwind CSS IntelliSense** - Tailwind autocomplete
- **PostCSS Language Support** - PostCSS syntax
- **TypeScript Vue Plugin (Volar)** - If using Vue
- **Thunder Client** - API testing
- **Docker** - Docker file support
- **Database Client** - PostgreSQL management

---

## Performance Targets

### Bundle Size
- Initial load: < 5MB
- Lazy-loaded chunks: < 500KB each
- Thumbnail size: < 50KB each (JPEG quality 60-70)

### Runtime Performance
- Gallery scroll: 60fps
- Image viewer pan/zoom: 60fps
- Upload progress update: < 100ms
- Sync operation: < 5s for 100 images
- Application startup: < 3s

### Network
- API response time: < 200ms
- Image upload: Progress indicator every 100ms
- Thumbnail loading: Progressive (low-res → high-res)

---

## Security Considerations

### Frontend
- ✅ Context isolation enabled (Electron)
- ✅ Node integration disabled in renderer
- ✅ Input sanitization (XSS prevention)
- ✅ Path validation before file operations
- ✅ Content Security Policy (CSP)

### Backend
- ✅ Helmet.js for HTTP headers
- ✅ CORS properly configured
- ✅ SQL injection prevention (parameterized queries)
- ✅ File type validation (magic number checking)
- ✅ File size limits enforced
- ✅ Path traversal prevention
- ✅ Rate limiting on uploads
- ✅ Authentication/Authorization (if implementing user system)

### Database
- ✅ Connection string in environment variables
- ✅ Least privilege database user
- ✅ Regular backups
- ✅ SQL injection prevention

---

## Alternative Technology Choices

### If Time is Limited
**Simplifications**:
- Skip i18n → Single language (English)
- Skip Zustand → Use React Context + useReducer
- Skip WASM/N-API → Focus on EXIF feature
- Skip Testing → Manual testing only

### If More Time Available
**Enhancements**:
- Add GraphQL (Apollo) instead of REST
- Add Redis for caching
- Add Elasticsearch for advanced search
- Implement user authentication (JWT)
- Add real-time sync (WebSockets)

### Framework Alternatives
- **Vue.js** instead of React
  - Vue Router, Pinia, Vuetify/Naive UI
- **Svelte/SvelteKit** (modern, lightweight)
- **Angular** (enterprise-grade)

### Backend Alternatives
- **Fastify** instead of Express (faster)
- **NestJS** (structured, TypeScript-first)
- **tRPC** (end-to-end type safety)

---

## Why This Stack?

### React + TypeScript
✅ Industry standard, large ecosystem
✅ Excellent TypeScript support
✅ Rich component libraries
✅ Great for complex UIs

### Tailwind CSS + shadcn/ui
✅ Rapid development
✅ Consistent design system
✅ Accessible components (WCAG compliant)
✅ Customizable and themeable
✅ Small bundle size

### PostgreSQL
✅ Robust and reliable
✅ JSONB support for flexible EXIF data
✅ Excellent indexing and query performance
✅ Industry standard

### Sharp
✅ Fastest image processing library for Node.js
✅ Low memory usage
✅ Supports all required formats (JPG, PNG, TIFF)
✅ Built-in thumbnail generation

### Zustand
✅ Simple API, low learning curve
✅ No boilerplate (vs Redux)
✅ TypeScript-first
✅ Perfect for medium-complexity apps

### Electron + Vite
✅ Fast development experience
✅ Hot module replacement (HMR)
✅ Modern build pipeline
✅ Easy to configure

---

## Migration Path (If Needed)

### From this stack to Production
1. **Add authentication**: Implement JWT or OAuth
2. **Add monitoring**: Sentry for error tracking, Analytics
3. **Add CDN**: CloudFront or Cloudflare for image delivery
4. **Scale database**: Read replicas, connection pooling
5. **Add caching**: Redis for frequently accessed data
6. **Implement CI/CD**: GitHub Actions for automated builds
7. **Add E2E tests**: Playwright for critical user flows

---

## License Considerations

All recommended packages use permissive licenses (MIT, BSD, Apache 2.0), safe for commercial use.

---

**Last Updated**: 2025-11-17
**Target Platform**: Windows (primary), macOS/Linux (secondary)
**Node.js Version**: >=18.0.0
**Electron Version**: 39.2.1
