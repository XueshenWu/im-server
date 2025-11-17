import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import 'dotenv/config';

// Database connection configuration
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create PostgreSQL connection
// For migrations
export const migrationClient = postgres(connectionString, { max: 1 });

// For queries
const queryClient = postgres(connectionString);

// Create Drizzle instance
export const db = drizzle(queryClient, { schema });

// Export schema for use in other files
export { schema };
