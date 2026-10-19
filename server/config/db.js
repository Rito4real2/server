const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const dbUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

    if (!dbUri) {
      console.error('❌ CRITICAL: MONGO_URI environment variable is missing!');
      return;
    }

    // If already connected, don't reconnect
    if (mongoose.connection.readyState >= 1) {
      return;
    }

    const opts = {
      bufferCommands: true, // Keep buffering enabled for persistent servers
    };

    const conn = await mongoose.connect(dbUri, opts);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    // Do NOT throw or call process.exit(1) so Render doesn't crash on startup timeout
  }
};

module.exports = connectDB;