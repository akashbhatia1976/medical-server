const { MongoClient } = require('mongodb');

// MongoDB connection URI - replace with your connection string if needed
const uri = process.env.MONGODB_URI; // Update this if hosted elsewhere
const client = new MongoClient(uri);

// Database name
const dbName = 'medicalReportsDB'; // Ensure the correct database name

/**
 * Connect to the MongoDB server and ensure necessary collections exist.
 */
const connectDB = async () => {
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    const existingCollections = collections.map(col => col.name);

    // Required collections
    const requiredCollections = ["reports", "users", "parameters", "shared_reports"];

    for (const collection of requiredCollections) {
      if (!existingCollections.includes(collection)) {
        await db.createCollection(collection);
        console.log(`✅ Created missing collection: ${collection}`);
      } else {
        console.log(`✅ Collection exists: ${collection}`);
      }
    }

    console.log('✅ Database initialization complete.');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

/**
 * Get the MongoDB database instance.
 * @returns {Db} MongoDB database instance
 */
const getDB = () => {
  return client.db(dbName);
};

/**
 * Close the MongoDB connection.
 */
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

