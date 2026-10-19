const mongoose = require('mongoose');

// Cache the connection across hot reloads and serverless invocations
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  // If a connection already exists, return it
  if (cached.conn) {
    return cached.conn;
  }

  // If a connection promise isn't already running, create one
  if (!cached.promise) {
    const dbUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

    if (!dbUri) {
      throw new Error('MONGO_URI environment variable is missing on Vercel!');
    }

    const opts = {
      bufferCommands: false, // Disable Mongoose buffering in serverless
    };

    cached.promise = mongoose.connect(dbUri, opts).then((mongooseInstance) => {
      console.log(`MongoDB Connected: ${mongooseInstance.connection.host}`);
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Reset promise on error so subsequent requests can retry
    cached.promise = null;
    console.error(`MongoDB Connection Error: ${error.message}`);
    throw error;
  }

  return cached.conn;
};

module.exports = connectDB;