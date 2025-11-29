import express, { Application } from 'express';
import { setupMinio } from './utils/minio-setup';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { errorHandler } from './middleware/errorHandler';
import imagesRoutes from './routes/images.routes';
import healthRoutes from './routes/health.routes';
import syncRoutes from './routes/sync.routes';
import webhookRoutes from './routes/webhook.routes';
import logger, { morganStream } from './config/logger';
import 'dotenv/config';

const app: Application = express();
const PORT = process.env.API_PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin images
  crossOriginEmbedderPolicy: false, // Disable for Electron compatibility
  contentSecurityPolicy: false, // Disabled for now - TODO: re-enable with proper configuration
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  exposedHeaders: [
    'Content-Length',
    'Content-Type',
    'X-Image-Id',
    'X-Image-UUID',
    'X-Image-Filename',
    'X-Image-Original-Name',
    'X-Image-Format',
    'X-Image-File-Size',
    'X-Image-Width',
    'X-Image-Height',
    'X-Image-Hash',
    'X-Image-Created-At',
    'X-Image-Updated-At',
    'X-Image-Is-Corrupted',
    'X-Current-Sequence',
    'X-Client-Sequence',
    'X-Operations-Behind',
  ],
}));
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', { stream: morganStream }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Image Management API Docs',
}));


app.use('/webhook', webhookRoutes);


// Serve static files for uploaded images and thumbnails with CORS headers
app.use('/storage', (_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static('storage'));

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/images', imagesRoutes);


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


const startServer = async () => {

  console.log("124sdf seETW")
  await setupMinio();

  // Start server
  app.listen(Number(PORT), HOST, () => {
    logger.info(`Server is running on http://${HOST}:${PORT}`);
    logger.info(`API Documentation: http://${HOST}:${PORT}/api-docs`);
    logger.info(`Health Check: http://${HOST}:${PORT}/api/health`);
  });

};

startServer();

export default app;
