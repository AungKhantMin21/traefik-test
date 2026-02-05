const pool = require("./db");

async function waitForDb(maxRetries = 10, delay = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await pool.query('SELECT NOW()');
      console.log('Database connection successful');
      return;
    } catch (error) {
      console.log(`Database connection attempt ${i + 1}/${maxRetries} failed:`, error.message);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

async function initDb() {
  try {
    // Wait for database to be ready
    await waitForDb();
    
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      )
    `);
    console.log('Users table created or already exists');

    // Insert test user
    await pool.query(`
      INSERT INTO users (email, password)
      VALUES ('test@example.com', 'password')
      ON CONFLICT (email) DO NOTHING
    `);
    console.log('Test user created or already exists');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

// run migration
try {
  initDb();
  console.log('Database initialization completed successfully');
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}
