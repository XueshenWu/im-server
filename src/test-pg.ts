import pkg from 'pg';
const { Client } = pkg;
import 'dotenv/config';

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

console.log('Connecting to:', process.env.DATABASE_URL);

try {
  await client.connect();
  console.log('✅ Connected successfully!');

  const result = await client.query('SELECT current_database(), current_user, version()');
  console.log(result.rows[0]);

  await client.end();
  process.exit(0);
} catch (error) {
  console.error('❌ Connection failed:', error);
  process.exit(1);
}
