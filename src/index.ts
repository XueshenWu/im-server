import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { errorHandler } from './middleware/errorHandler';
import imagesRoutes from './routes/images.routes';
import healthRoutes from './routes/health.routes';
import collectionsRoutes from './routes/collections.routes';
import 'dotenv/config';

const app: Application = express();
const PORT = process.env.API_PORT || 3000;

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin images
  crossOriginEmbedderPolicy: false, // Disable for Electron compatibility
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Type'],
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Image Management API Docs',
}));

// Serve static files for uploaded images and thumbnails with CORS headers
app.use('/storage', (_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static('storage'));

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/images', imagesRoutes);
app.use('/api/collections', collectionsRoutes);

// Root endpoint - redirect to API docs
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    statusCode: 404,
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/api/health\n`);
});

export default app;
