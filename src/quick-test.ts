import postgres from 'postgres';
import 'dotenv/config';

const connectionString = 'postgresql://testuser:testpass123@localhost:5432/imagedb';
console.log('Connecting to:', connectionString);

const sql = postgres(connectionString);

try {
  const result = await sql`SELECT current_database(), current_user, version()`;
  console.log('✅ Connected successfully!');
  console.log(result[0]);
} catch (error) {
  console.error('❌ Connection failed:', error);
} finally {
  await sql.end();
  process.exit(0);
}
