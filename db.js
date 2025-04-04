const { MongoClient } = require('mongodb');

// MongoDB connection URI - replace with your connection string if needed
const uri = process.env.MONGODB_URI; // Update this if hosted elsewhere
const client = new MongoClient(uri);

// Database name
const dbName = 'medicalReportsDB'; // Ensure the correct database name

let db; // Store the DB instance globally

/**
 * Connect to the MongoDB server and ensure necessary collections exist.
 */
const connectDB = async () => {
  try {
    if (db) return db;  // If already connected, return the existing instance
    
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    const existingCollections = collections.map(col => col.name);

    // Required collections
    const requiredCollections = ["reports", "users", "parameters", "shared_reports", "comments"];

    for (const collection of requiredCollections) {
      if (!existingCollections.includes(collection)) {
        await db.createCollection(collection);
        console.log(`✅ Created missing collection: ${collection}`);
      } else {
        console.log(`✅ Collection exists: ${collection}`);
      }
    }

    console.log('✅ Database initialization complete.');
    return db;  // Ensure we return the DB instance after connection
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw new Error("Failed to connect to the database.");
  }
};

/**
 * Get the MongoDB database instance.
 * @returns {Db} MongoDB database instance
 */
const getDB = () => {
  if (!db) {
    throw new Error('Database not connected. Please initialize the connection first.');
  }
  return db;
};

const closeDB = async () => {
  try {
    await client.close();
    console.log('🔴 MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
  }
};

module.exports = {
  connectDB,
  getDB,
  closeDB,
};

