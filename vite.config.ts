import { defineConfig } from 'vite';
import { VitePluginNode } from 'vite-plugin-node';

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    ...VitePluginNode({
      adapter: 'express',
      appPath: './src/index.ts',
      exportName: 'default',
      tsCompiler: 'esbuild',
      swcOptions: {},
    }),
  ],
  build: {
    outDir: 'dist',
    target: 'node18',
    ssr: true,
    rollupOptions: {
      input: './src/index.ts',
      output: {
        format: 'es',
        entryFileNames: 'index.js',
      },
      external: [
        'express',
        'cors',
        'helmet',
        'morgan',
        'multer',
        'sharp',
        'pg',
        'postgres',
        'dotenv',
        'exifr',
        'drizzle-orm',
        'swagger-jsdoc',
        'swagger-ui-express',
        'crypto',
        'fs',
        'path',
        'url',
      ],
    },
  },
  optimizeDeps: {
    exclude: ['sharp'],
  },
});
